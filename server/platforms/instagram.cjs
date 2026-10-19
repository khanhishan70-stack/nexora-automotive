const { normalizeVideo, dedupeByPlatformId } = require('../lib/normalize.cjs');

const GRAPH = 'https://graph.facebook.com/v21.0';

function igConfig() {
  return {
    clientId: process.env.INSTAGRAM_CLIENT_ID || '',
    clientSecret: process.env.INSTAGRAM_CLIENT_SECRET || '',
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI || 'http://localhost:5174/api/oauth/instagram/callback',
  };
}

function isConfigured() {
  const c = igConfig();
  return Boolean(c.clientId && c.clientSecret);
}

const LIMITATION_NOTE =
  'Instagram\'s official APIs do not allow apps to browse arbitrary public Reels or a user\'s home feed. ' +
  'This app can only access media from a connected professional/creator account that granted permission.';

function authorizeUrl(state) {
  const c = igConfig();
  const p = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    scope: 'email,instagram_basic,instagram_content_publish,pages_show_list,business_management',
    response_type: 'code',
    state,
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${p}`;
}

async function exchangeCode(code) {
  const c = igConfig();
  const res = await fetch(`${GRAPH}/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: c.redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `instagram token exchange failed: ${res.status}`);
  if (!body.access_token) throw new Error('instagram token exchange returned no access token');
  return body;
}

async function refreshAccessToken() {
  throw Object.assign(new Error('Instagram long-lived token refresh must be performed via the Graph API exchange endpoint'), {
    status: 501,
  });
}

async function revokeToken(token) {
  await fetch(`${GRAPH}/me/permissions`, { method: 'DELETE' }).catch(() => {});
  await fetch(`${GRAPH}/invalidate_sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ access_token: token }),
  }).catch(() => {});
}

async function graph(path, params, token, quota, operation = 'me') {
  if (quota && !quota.canSpend('instagram', operation)) {
    throw Object.assign(new Error('Instagram API rate budget exhausted'), { status: 429, body: { reason: 'quotaExhausted' } });
  }
  const url = new URL(`${GRAPH}${path}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(body?.error?.message || `instagram ${path} failed: ${res.status}`), {
      status: res.status,
      body,
    });
  }
  if (quota) quota.spend('instagram', operation);
  return body;
}

async function resolveInstagramAccount(token, quota) {
  const me = await graph('/me', { fields: 'id,name' }, token, quota, 'me');
  const pages = await graph('/me/accounts', { fields: 'id,name,instagram_business_account' }, token, quota, 'me');
  for (const page of pages.data || []) {
    if (page.instagram_business_account?.id) {
      return {
        platformAccountId: page.instagram_business_account.id,
        label: `${page.name} (IG: ${page.instagram_business_account.id})`,
      };
    }
  }
  return { platformAccountId: me.id, label: me.name || me.id };
}

async function getMe(token, quota) {
  return resolveInstagramAccount(token, quota);
}

async function getUserInfo(token) {
  const body = await graph('/me', { fields: 'id,name,email' }, token, null, 'me');
  return { id: body.id, name: body.name || null, email: body.email || null };
}

async function getMedia(token, igUserId, quota, opts = {}) {
  const fields = [
    'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,media_product_type',
    'like_count,comments_count',
  ].join(',');
  const body = await graph(
    `/${igUserId}/media`,
    { fields, limit: opts.limit || 24, after: opts.after },
    token,
    quota,
    'me/media'
  );
  const videos = [];
  for (const item of body.data || []) {
    const isVideo = item.media_type === 'VIDEO' || item.media_product_type === 'REELS';
    if (!isVideo && opts.videosOnly !== false) continue;
    videos.push(
      normalizeVideo('instagram', {
        platformVideoId: item.id,
        creatorId: igUserId,
        creatorName: null,
        title: (item.caption || '').slice(0, 120) || 'Instagram video',
        description: item.caption || null,
        thumbnailUrl: item.media_url || item.thumbnail_url || null,
        sourceUrl: item.permalink || null,
        publishedAt: item.timestamp,
        isLive: false,
        metadata: { likeCount: item.like_count, commentsCount: item.comments_count },
      })
    );
  }
  return { videos: dedupeByPlatformId(videos), nextAfter: body.paging?.cursors?.after || null };
}

async function getMyMedia(token, igUserId, quota, opts) {
  return getMedia(token, igUserId, quota, opts);
}

module.exports = {
  isConfigured,
  LIMITATION_NOTE,
  authorizeUrl,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  getMe,
  getUserInfo,
  getMedia,
  getMyMedia,
};
