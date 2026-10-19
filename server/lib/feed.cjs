const { db, id } = require('../db.cjs');
const { recommendFeed } = require('./recommend.cjs');

const CATEGORIES = ['latest', 'trending', 'live', 'following', 'for-you', 'recently-added'];

function hydrate(rows) {
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    platformVideoId: r.platform_video_id,
    creatorId: r.creator_id,
    creatorName: r.creator_name,
    title: r.title,
    description: r.description,
    thumbnailUrl: r.thumbnail_url,
    sourceUrl: r.source_url,
    publishedAt: r.published_at,
    duration: r.duration,
    isLive: Boolean(r.is_live),
    viewCount: r.view_count,
    metadata: JSON.parse(r.metadata || '{}'),
    lastDiscoveredAt: r.last_discovered_at,
  }));
}

function eligibleVideos(userId, platform) {
  let sql = `
    SELECT v.* FROM videos v
    WHERE (
      v.id IN (SELECT video_id FROM collection_items ci
        JOIN collections c ON c.id = ci.collection_id
        WHERE c.owner_id = ?)
      OR v.id IN (SELECT video_id FROM interactions WHERE user_id = ?)
      OR v.last_discovered_at > ?
    )`;
  const params = [userId, userId, Date.now() - 1000 * 60 * 60 * 24 * 30];
  if (platform && platform !== 'all') {
    sql += ' AND v.platform = ?';
    params.push(platform);
  }
  sql += ' ORDER BY v.published_at DESC, v.last_discovered_at DESC LIMIT 500';
  return hydrate(db.prepare(sql).all(...params));
}

function followingChannelIds(userId) {
  const rows = db
    .prepare(
      `SELECT DISTINCT v.creator_id FROM interactions i
       JOIN videos v ON v.id = i.video_id
       WHERE i.user_id = ? AND v.creator_id IS NOT NULL`
    )
    .all(userId);
  return new Set(rows.map((r) => r.creator_id));
}

function getFeed(userId, { category = 'latest', platform = 'all', limit = 40, offset = 0 } = {}) {
  if (!CATEGORIES.includes(category)) category = 'latest';
  let items = eligibleVideos(userId, platform);

  switch (category) {
    case 'latest':
    case 'recently-added':
      items.sort((a, b) => (b.publishedAt || b.lastDiscoveredAt) - (a.publishedAt || a.lastDiscoveredAt));
      if (category === 'recently-added') items.sort((a, b) => b.lastDiscoveredAt - a.lastDiscoveredAt);
      break;
    case 'trending':
      items = items.filter((v) => v.viewCount);
      items.sort((a, b) => {
        const score = (v) => (v.viewCount || 0) / Math.pow(Math.max(1, (Date.now() - (v.publishedAt || Date.now())) / 86400000), 0.8);
        return score(b) - score(a);
      });
      break;
    case 'live':
      items = items.filter((v) => v.isLive);
      items.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
      break;
    case 'following': {
      const ch = followingChannelIds(userId);
      items = items.filter((v) => ch.has(v.creatorId));
      items.sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
      break;
    }
    case 'for-you': {
      const intRows = db
        .prepare('SELECT video_id AS videoId, type FROM interactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 300')
        .all(userId);
      const prefs = JSON.parse(
        db.prepare('SELECT preferences FROM users WHERE id = ?').get(userId)?.preferences || '{}'
      );
      items = recommendFeed(items, intRows, prefs.interests || [], 200);
      break;
    }
  }

  const total = items.length;
  const page = items.slice(offset, offset + limit);
  return {
    category,
    platform,
    total,
    offset,
    limit,
    items: page,
    nextOffset: offset + page.length < total ? offset + page.length : null,
  };
}

function syncStatus(userId) {
  return db.prepare('SELECT * FROM feed_sync WHERE user_id = ?').all(userId).map((r) => ({
    platform: r.platform,
    status: r.status,
    lastSuccessAt: r.last_success_at,
    nextRunAt: r.next_run_at,
    error: r.error,
    cursor: r.cursor ? '[set]' : null,
    updatedAt: r.updated_at,
  }));
}

function setSyncStatus(userId, platform, patch) {
  const now = Date.now();
  db.prepare(
    `INSERT INTO feed_sync (id, user_id, platform, status, last_success_at, next_run_at, cursor, error, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON CONFLICT(user_id, platform) DO UPDATE SET
       status = COALESCE(excluded.status, feed_sync.status),
       last_success_at = COALESCE(excluded.last_success_at, feed_sync.last_success_at),
       next_run_at = COALESCE(excluded.next_run_at, feed_sync.next_run_at),
       cursor = COALESCE(excluded.cursor, feed_sync.cursor),
       error = excluded.error,
       updated_at = excluded.updated_at`
  ).run(
    id('sync'),
    userId,
    platform,
    patch.status ?? 'idle',
    patch.lastSuccessAt ?? null,
    patch.nextRunAt ?? null,
    patch.cursor ?? null,
    patch.error ?? null,
    now
  );
}

module.exports = { getFeed, syncStatus, setSyncStatus, CATEGORIES, eligibleVideos };
