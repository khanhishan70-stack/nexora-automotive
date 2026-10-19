const crypto = require('node:crypto');

function normalizeVideo(platform, raw) {
  if (!platform || !raw || !raw.platformVideoId) return null;
  const now = Date.now();
  return {
    platform,
    platformVideoId: String(raw.platformVideoId),
    creatorId: raw.creatorId ? String(raw.creatorId) : null,
    creatorName: raw.creatorName ?? null,
    title: raw.title ?? null,
    description: raw.description ?? null,
    thumbnailUrl: raw.thumbnailUrl ?? null,
    sourceUrl: raw.sourceUrl ?? null,
    publishedAt: raw.publishedAt ? new Date(raw.publishedAt).getTime() : null,
    duration: typeof raw.duration === 'number' ? raw.duration : parseIsoDuration(raw.duration),
    isLive: raw.isLive ? 1 : 0,
    viewCount: typeof raw.viewCount === 'number' ? raw.viewCount : null,
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
    lastDiscoveredAt: now,
    metadataUpdatedAt: now,
  };
}

function parseIsoDuration(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return (Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)) * 1000;
}

function videoKey(platform, platformVideoId) {
  return `${platform}::${platformVideoId}`;
}

function dedupeByPlatformId(items) {
  const seen = new Map();
  for (const item of items) {
    if (!item) continue;
    const k = videoKey(item.platform, item.platformVideoId);
    if (!seen.has(k)) seen.set(k, item);
  }
  return [...seen.values()];
}

function upsertVideoSql() {
  return `
INSERT INTO videos (
  id, platform, platform_video_id, creator_id, creator_name, title, description,
  thumbnail_url, source_url, published_at, duration, is_live, view_count, metadata,
  last_discovered_at, metadata_updated_at
) VALUES (
  @id, @platform, @platformVideoId, @creatorId, @creatorName, @title, @description,
  @thumbnailUrl, @sourceUrl, @publishedAt, @duration, @isLive, @viewCount, @metadata,
  @lastDiscoveredAt, @metadataUpdatedAt
)
ON CONFLICT(platform, platform_video_id) DO UPDATE SET
  creator_id = COALESCE(excluded.creator_id, videos.creator_id),
  creator_name = COALESCE(excluded.creator_name, videos.creator_name),
  title = COALESCE(excluded.title, videos.title),
  description = COALESCE(excluded.description, videos.description),
  thumbnail_url = COALESCE(excluded.thumbnail_url, videos.thumbnail_url),
  source_url = COALESCE(excluded.source_url, videos.source_url),
  published_at = COALESCE(excluded.published_at, videos.published_at),
  duration = COALESCE(excluded.duration, videos.duration),
  is_live = excluded.is_live,
  view_count = COALESCE(excluded.view_count, videos.view_count),
  metadata = excluded.metadata,
  last_discovered_at = excluded.last_discovered_at,
  metadata_updated_at = excluded.metadata_updated_at
RETURNING id`;
}

module.exports = { normalizeVideo, parseIsoDuration, videoKey, dedupeByPlatformId, upsertVideoSql };
