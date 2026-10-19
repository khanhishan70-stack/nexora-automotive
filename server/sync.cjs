const { db, id } = require('./db.cjs');
const { decryptToken, encryptToken } = require('./lib/crypto.cjs');
const { createQuotaManager, backoffDelayMs, isRetryableError } = require('./lib/quota.cjs');
const { upsertVideoSql } = require('./lib/normalize.cjs');
const { setSyncStatus } = require('./lib/feed.cjs');
const collections = require('./lib/collections.cjs');
const youtube = require('./platforms/youtube.cjs');
const instagram = require('./platforms/instagram.cjs');

const quota = createQuotaManager();
let timer = null;

function upsertVideos(videoList) {
  const stmt = db.prepare(upsertVideoSql());
  const ids = [];
  for (const v of videoList) {
    if (!v) continue;
    const row = stmt.get({
      id: id('vid'),
      platform: v.platform,
      platformVideoId: v.platformVideoId,
      creatorId: v.creatorId,
      creatorName: v.creatorName,
      title: v.title,
      description: v.description,
      thumbnailUrl: v.thumbnailUrl,
      sourceUrl: v.sourceUrl,
      publishedAt: v.publishedAt,
      duration: v.duration,
      isLive: v.isLive,
      viewCount: v.viewCount,
      metadata: JSON.stringify(v.metadata || {}),
      lastDiscoveredAt: v.lastDiscoveredAt,
      metadataUpdatedAt: v.metadataUpdatedAt,
    });
    ids.push(row.id);
  }
  return ids;
}

function accountRows(userId, platform) {
  return db
    .prepare("SELECT * FROM connected_accounts WHERE user_id = ? AND platform = ? AND status = 'connected'")
    .all(userId, platform);
}

async function refreshAccessToken(account, platformClient) {
  const tokens = JSON.parse(decryptToken(account.token_ref));
  if (!tokens.refresh_token || !platformClient.refreshAccessToken) return tokens;
  if (tokens.expires_at && tokens.expires_at > Date.now() + 60000) return tokens;
  const fresh = await platformClient.refreshAccessToken(tokens.refresh_token);
  const merged = {
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token || tokens.refresh_token,
    expires_at: Date.now() + (fresh.expires_in || 3600) * 1000,
  };
  db.prepare('UPDATE connected_accounts SET token_ref = ?, token_expires_at = ? WHERE id = ?').run(
    encryptToken(JSON.stringify(merged)),
    merged.expires_at,
    account.id
  );
  return merged;
}

async function syncYouTubeAccount(account) {
  const tokens = await refreshAccessToken(account, youtube);
  const { videos } = await youtube.getSubscriptionFeed(tokens.access_token, quota);
  const lives = await youtube.getLiveBroadcasts(tokens.access_token, quota).catch(() => []);
  const all = [...videos, ...lives];
  upsertVideos(all);
  db.prepare('UPDATE connected_accounts SET last_sync_at = ?, last_error = NULL WHERE id = ?').run(Date.now(), account.id);
  return all.length;
}

async function syncInstagramAccount(account) {
  const tokens = await refreshAccessToken(account, instagram);
  const igUserId = account.platform_account_id;
  const { videos } = await instagram.getMyMedia(tokens.access_token, igUserId, quota, { limit: 24 });
  upsertVideos(videos);
  db.prepare('UPDATE connected_accounts SET last_sync_at = ?, last_error = NULL WHERE id = ?').run(Date.now(), account.id);
  return videos.length;
}

async function syncUserPlatform(userId, platform) {
  const client = platform === 'youtube' ? youtube : instagram;
  const syncFn = platform === 'youtube' ? syncYouTubeAccount : syncInstagramAccount;
  const accounts = accountRows(userId, platform);
  if (!accounts.length) {
    setSyncStatus(userId, platform, { status: 'disconnected', error: null });
    return { synced: 0, status: 'disconnected' };
  }
  if (!client.isConfigured()) {
    const msg = `${platform} API credentials are not configured on this server`;
    setSyncStatus(userId, platform, { status: 'not_configured', error: msg });
    return { synced: 0, status: 'not_configured', error: msg };
  }

  const prior = db.prepare('SELECT * FROM feed_sync WHERE user_id = ? AND platform = ?').get(userId, platform);
  const attempt = prior?.error ? (prior.error.match(/attempt=(\d+)/) ? Number( prior.error.match(/attempt=(\d+)/)[1]) : 0) : 0;

  setSyncStatus(userId, platform, { status: 'syncing' });
  try {
    let total = 0;
    for (const account of accounts) {
      try {
        total += await syncFn(account);
      } catch (err) {
        if (isRetryableError(err)) throw err;
        db.prepare('UPDATE connected_accounts SET last_error = ? WHERE id = ?').run(err.message, account.id);
      }
    }
    setSyncStatus(userId, platform, {
      status: 'ok',
      lastSuccessAt: Date.now(),
      nextRunAt: Date.now() + 15 * 60 * 1000,
      error: null,
    });
    return { synced: total, status: 'ok' };
  } catch (err) {
    const nextAttempt = attempt + 1;
    const delay = backoffDelayMs(nextAttempt);
    setSyncStatus(userId, platform, {
      status: 'error',
      nextRunAt: Date.now() + delay,
      error: `${err.message} (attempt=${nextAttempt}, retryIn=${Math.round(delay / 1000)}s)`,
    });
    return { synced: 0, status: 'error', error: err.message };
  }
}

async function runDiscoveryRules() {
  const due = collections.rulesDue();
  for (const rule of due) {
    const terms = JSON.parse(rule.search_terms || '[]');
    if (!terms.length) {
      collections.touchRule(rule.id);
      continue;
    }
    const platforms = JSON.parse(rule.platforms || '["youtube"]');
    let error = null;
    if (platforms.includes('youtube')) {
      const accounts = accountRows(rule.owner_id, 'youtube');
      if (accounts.length && youtube.isConfigured()) {
        try {
          const tokens = await refreshAccessToken(accounts[0], youtube);
          for (const term of terms.slice(0, 3)) {
            const { videos } = await youtube.searchVideos(tokens.access_token, term, quota, { order: 'date', maxResults: 10 });
            const dbIds = upsertVideos(videos);
            for (const dbId of dbIds) collections.recordMatch(rule.id, dbId);
          }
        } catch (err) {
          error = err.message;
        }
      } else {
        error = 'YouTube not connected or not configured';
      }
    }
    collections.touchRule(rule.id, error);
  }
}

async function syncAllUsers() {
  const users = db.prepare('SELECT id FROM users').all();
  for (const u of users) {
    for (const platform of ['youtube', 'instagram']) {
      const row = db.prepare('SELECT next_run_at FROM feed_sync WHERE user_id = ? AND platform = ?').get(u.id, platform);
      if (row && row.next_run_at && row.next_run_at > Date.now()) continue;
      await syncUserPlatform(u.id, platform);
    }
  }
  await runDiscoveryRules();
}

function startWorker(intervalMs = Number(process.env.SYNC_INTERVAL_MS || 5 * 60 * 1000)) {
  if (timer) return;
  timer = setInterval(() => {
    syncAllUsers().catch((err) => console.error('[sync worker]', err.message));
  }, intervalMs);
  if (timer.unref) timer.unref();
}

function stopWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startWorker, stopWorker, syncUserPlatform, syncAllUsers, upsertVideos, quota, runDiscoveryRules };
