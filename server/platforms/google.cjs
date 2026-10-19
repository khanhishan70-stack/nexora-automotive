const { normalizeVideo, dedupeByPlatformId } = require('../lib/normalize.cjs');

const GRAPH = 'https://www.googleapis.com';

function googleConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5174/api/oauth/google/callback',
  };
}

function isConfigured() {
  const c = googleConfig();
  return Boolean(c.clientId && c.clientSecret);
}

function authorizeUrl(state) {
  const c = googleConfig();
  const p = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/youtube.readonly',
    ].join(' '),
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function exchangeCode(code) {
  const c = googleConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
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
  if (!res.ok) throw new Error(`google token exchange failed: ${res.status}`);
  return res.json();
}

async function refreshAccessToken(refreshToken) {
  const c = googleConfig();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`google refresh failed: ${res.status}`);
  return res.json();
}

async function revokeToken(token) {
  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token, client_id: googleConfig().clientId }),
  }).catch(() => {});
}

async function getUserInfo(token) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`google userinfo failed: ${res.status}`);
  return res.json();
}

async function getYouTubeChannel(token) {
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const body = await res.json();
  const ch = body.items?.[0];
  if (!ch) return null;
  return {
    platformAccountId: ch.id,
    label: ch.snippet?.title || ch.id,
    platform: 'youtube',
  };
}

async function getInstagramAccounts(token) {
  const accounts = [];
  try {
    const res = await fetch('https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account', {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return accounts;
    const body = await res.json();
    for (const page of body.data || []) {
      if (page.instagram_business_account?.id) {
        accounts.push({
          platformAccountId: page.instagram_business_account.id,
          label: `${page.name} (IG: ${page.instagram_business_account.id})`,
          platform: 'instagram',
        });
      }
    }
  } catch {}
  return accounts;
}

async function discoverAccounts(token) {
  const results = { youtube: [], instagram: [] };
  
  const yt = await getYouTubeChannel(token);
  if (yt) results.youtube.push(yt);
  
  const ig = await getInstagramAccounts(token);
  results.instagram = ig;
  
  return results;
}

module.exports = {
  isConfigured,
  authorizeUrl,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
  getUserInfo,
  discoverAccounts,
};