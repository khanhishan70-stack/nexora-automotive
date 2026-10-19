const { normalizeVideo, dedupeByPlatformId } = require('../lib/normalize.cjs');

const YT = 'https://www.googleapis.com/youtube/v3';
const OAUTH = 'https://oauth2.googleapis.com';

function ytConfig() {
  return {
    clientId: process.env.YOUTUBE_CLIENT_ID || '',
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || '',
    redirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:5174/api/oauth/youtube/callback',
  };
}

function isConfigured() {
  const c = ytConfig();
  return Boolean(c.clientId && c.clientSecret);
}

function authorizeUrl(state) {
  const c = ytConfig();
  const p = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'openid',
      'email',
      'profile',
    ].join(' '),
    state,
  });
  return `${OAUTH}/auth?${p}`;
}

async function exchangeCode(code) {
  const c = ytConfig();
  const res = await fetch(`${OAUTH}/token`, {
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
  if (!res.ok) throw new Error(`youtube token exchange failed: ${res.status}`);
  return res.json();
}

async function refreshAccessToken(refreshToken) {
  const c = ytConfig();
  const res = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`youtube refresh failed: ${res.status}`);
  return res.json();
}

async function revokeToken(token) {
  const c = ytConfig();
  await fetch(`${OAUTH}/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token, client_id: c.clientId }),
  }).catch(() => {});
}

class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function api(token, operation, params, quota) {
  if (quota && !quota.canSpend('youtube', operation)) {
    throw new ApiError(429, 'YouTube API quota exhausted for today; retry after reset', { reason: 'quotaExhausted' });
  }
  const url = new URL(`${YT}/${operation}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new ApiError(503, 'YouTube API key not configured', { reason: 'not_configured' });
  url.searchParams.set('key', key);

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.message || `YouTube ${operation} failed`, body);
  }
  if (quota) quota.spend('youtube', operation);
  return body;
}

function mapSnippet(snippet, id, extra = {}) {
  return normalizeVideo('youtube', {
    platformVideoId: id,
    creatorId: snippet.channelId,
    creatorName: snippet.channelTitle,
    title: snippet.title,
    description: snippet.description,
    thumbnailUrl:
      snippet.thumbnails?.maxres?.url ||
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url ||
      null,
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    publishedAt: snippet.publishedAt,
    ...extra,
  });
}

async function getMe(token, quota) {
  const body = await api(token, 'channels', { part: 'snippet,statistics', mine: true }, quota);
  const ch = body.items?.[0];
  if (!ch) throw new ApiError(404, 'No YouTube channel found for this account');
  return {
    platformAccountId: ch.id,
    label: ch.snippet?.title || ch.id,
  };
}

async function getSubscriptions(token, quota, maxPages = 3) {
  const out = [];
  let pageToken;
  for (let i = 0; i < maxPages; i++) {
    const body = await api(
      token,
      'subscriptions',
      { part: 'snippet,contentDetails', mine: true, maxResults: 50, pageToken },
      quota
    );
    for (const sub of body.items || []) {
      out.push({
        channelId: sub.snippet?.resourceId?.channelId || sub.id,
        title: sub.snippet?.title,
        thumb: sub.snippet?.thumbnails?.default?.url,
      });
    }
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

async function getSubscriptionFeed(token, quota, maxChannels = 15) {
  const subs = await getSubscriptions(token, quota);
  const chosen = subs.slice(0, maxChannels);
  const videos = [];
  for (const sub of chosen) {
    try {
      const body = await api(
        token,
        'search',
        {
          part: 'snippet',
          channelId: sub.channelId,
          order: 'date',
          type: 'video',
          maxResults: 8,
          videoEmbeddable: 'true',
        },
        quota
      );
      for (const item of body.items || []) {
        videos.push(mapSnippet(item.snippet, item.id.videoId));
      }
    } catch (err) {
      if (err.status === 429) throw err;
    }
  }
  return { subscriptions: subs, videos: dedupeByPlatformId(videos) };
}

async function searchVideos(token, query, quota, opts = {}) {
  const body = await api(
    token,
    'search',
    {
      part: 'snippet',
      q: query,
      type: 'video',
      order: opts.order || 'relevance',
      maxResults: opts.maxResults || 24,
      pageToken: opts.pageToken,
      videoEmbeddable: 'true',
      publishedAfter: opts.publishedAfter,
      channelId: opts.channelId,
    },
    quota
  );
  const ids = (body.items || []).map((i) => i.id.videoId).filter(Boolean);
  let details = { items: [] };
  if (ids.length) {
    details = await api(token, 'videos', { part: 'contentDetails,statistics,liveStreamingDetails', id: ids.join(',') }, quota);
  }
  const detailById = new Map((details.items || []).map((d) => [d.id, d]));
  const videos = (body.items || [])
    .map((item) => {
      const d = detailById.get(item.id.videoId);
      return mapSnippet(item.snippet, item.id.videoId, {
        duration: d?.contentDetails?.duration,
        viewCount: d?.statistics?.viewCount ? Number(d.statistics.viewCount) : null,
        isLive: Boolean(d?.liveStreamingDetails?.actualStartTime && !d?.liveStreamingDetails?.endTime),
      });
    })
    .filter(Boolean);
  return { videos: dedupeByPlatformId(videos), nextPageToken: body.nextPageToken || null };
}

async function getLiveBroadcasts(token, quota) {
  const body = await api(
    token,
    'liveBroadcasts',
    { part: 'snippet,contentDetails,liveStreamingDetails', mine: true, eventStatus: 'active', maxResults: 25 },
    quota
  );
  return dedupeByPlatformId(
    (body.items || []).map((b) =>
      mapSnippet(b.snippet, b.id, {
        isLive: true,
        sourceUrl: b.snippet?.liveChatId ? `https://www.youtube.com/watch?v=${b.id}` : `https://www.youtube.com/watch?v=${b.id}`,
      })
    )
  );
}

async function getVideosByIds(token, ids, quota) {
  if (!ids.length) return [];
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const body = await api(
      token,
      'videos',
      { part: 'snippet,contentDetails,statistics,liveStreamingDetails', id: chunk.join(',') },
      quota
    );
    for (const d of body.items || []) {
      out.push(
        mapSnippet(d.snippet, d.id, {
          duration: d.contentDetails?.duration,
          viewCount: d.statistics?.viewCount ? Number(d.statistics.viewCount) : null,
          isLive: Boolean(d.liveStreamingDetails?.actualStartTime && !d.liveStreamingDetails?.endTime),
        })
      );
    }
  }
  return dedupeByPlatformId(out);
}

module.exports = {
  isConfigured,
  authorizeUrl,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  getMe,
  getSubscriptions,
  getSubscriptionFeed,
  searchVideos,
  getLiveBroadcasts,
  getVideosByIds,
  ApiError,
};
