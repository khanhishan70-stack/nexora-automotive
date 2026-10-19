const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, id } = require('./db.cjs');
const {
  hashPassword,
  verifyPassword,
  encryptToken,
  decryptToken,
  createSession,
  destroySession,
  sessionFromRequest,
  parseCookies,
} = require('./lib/crypto.cjs');
const { createQuotaManager } = require('./lib/quota.cjs');
const { upsertVideoSql, normalizeVideo } = require('./lib/normalize.cjs');
const feedLib = require('./lib/feed.cjs');
const collections = require('./lib/collections.cjs');
const { recommendFeed } = require('./lib/recommend.cjs');
const youtube = require('./platforms/youtube.cjs');
const instagram = require('./platforms/instagram.cjs');
const google = require('./platforms/google.cjs');
const sync = require('./sync.cjs');

const app = express();
const PORT = Number(process.env.PORT || 5174);
const quota = createQuotaManager();

app.use(express.json({ limit: '1mb' }));

const authHits = new Map();
function rateLimit(bucket, limit, windowMs) {
  return (req, res, next) => {
    const key = `${bucket}:${req.ip}`;
    const now = Date.now();
    const arr = (authHits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= limit) return res.status(429).json({ error: 'Too many requests, slow down' });
    arr.push(now);
    authHits.set(key, arr);
    next();
  };
}

function requireAuth(req, res, next) {
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: 'Not signed in' });
  const user = db.prepare('SELECT id, email, display_name, preferences FROM users WHERE id = ?').get(session.user_id);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  if (req.method !== 'GET') {
    const headerCsrf = req.headers['x-csrf-token'];
    if (!headerCsrf || headerCsrf !== session.csrf_token) {
      return res.status(403).json({ error: 'CSRF check failed' });
    }
  }
  req.user = user;
  req.session = session;
  next();
}

function setSessionCookies(res, session) {
  res.setHeader(
    'Set-Cookie',
    `rr_session=${session.sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
}

function slugify(str) {
  return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

function generateUsername(base) {
  const clean = slugify(base || 'creator') || 'creator';
  let candidate = clean;
  let n = 1;
  while (db.prepare('SELECT id FROM users WHERE username = ?').get(candidate)) {
    n += 1;
    candidate = `${clean}-${n}`;
  }
  return candidate;
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    youtubeConfigured: youtube.isConfigured(),
    instagramConfigured: instagram.isConfigured(),
    youtubeQuota: quota.snapshot('youtube'),
    instagramQuota: quota.snapshot('instagram'),
  });
});

app.post('/api/auth/register', rateLimit('auth', 10, 60000), (req, res) => {
  const { email, password, displayName } = req.body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Valid email required' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'An account with that email already exists' });
  const uid = id('usr');
  const username = generateUsername(displayName || email.split('@')[0]);
  db.prepare('INSERT INTO users (id, email, password_hash, display_name, username, preferences, created_at) VALUES (?,?,?,?,?,?,?)').run(
    uid,
    email.toLowerCase(),
    hashPassword(password),
    displayName || email.split('@')[0],
    username,
    JSON.stringify({ interests: [] }),
    Date.now()
  );
  const session = createSession(uid);
  setSessionCookies(res, session);
  res.json({ user: { id: uid, email: email.toLowerCase(), displayName: displayName || email.split('@')[0] }, csrfToken: session.csrfToken });
});

app.post('/api/auth/login', rateLimit('auth', 10, 60000), (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  
  if (!user) {
    return res.status(401).json({ error: 'No account found with that email. Try registering first.' });
  }
  if (!user.password_hash || user.password_hash === 'google-oauth') {
    return res.status(401).json({ error: 'This account uses Google Sign-In. Use "Sign in with Google" button instead.' });
  }
  if (!verifyPassword(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect password. Check caps lock or try registering a new account.' });
  }
  const session = createSession(user.id);
  setSessionCookies(res, session);
  res.json({
    user: { id: user.id, email: user.email, displayName: user.display_name },
    csrfToken: session.csrfToken,
  });
});

app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.rr_session) destroySession(cookies.rr_session);
  res.setHeader('Set-Cookie', 'rr_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const session = sessionFromRequest(req);
  if (!session) return res.json({ user: null });
  const user = db.prepare('SELECT id, email, display_name, username, bio, accent_color, avatar_url, is_public, preferences FROM users WHERE id = ?').get(session.user_id);
  if (!user) return res.json({ user: null });
  res.json({
    user: { id: user.id, email: user.email, displayName: user.display_name },
    csrfToken: session.csrf_token,
    preferences: JSON.parse(user.preferences || '{}'),
    profile: {
      username: user.username,
      bio: user.bio || '',
      accentColor: user.accent_color || '#ff2d55',
      avatarUrl: user.avatar_url || '',
      isPublic: Boolean(user.is_public),
    },
  });
});

app.put('/api/users/preferences', requireAuth, (req, res) => {
  const { interests } = req.body || {};
  if (!Array.isArray(interests)) return res.status(400).json({ error: 'interests must be an array' });
  const clean = interests.map((s) => String(s).slice(0, 80)).slice(0, 30);
  const current = JSON.parse(req.user.preferences || '{}');
  current.interests = clean;
  db.prepare('UPDATE users SET preferences = ? WHERE id = ?').run(JSON.stringify(current), req.user.id);
  res.json({ preferences: current });
});

// Dev-only: create a test user for testing
// Seeds demo videos/collections/interactions when the library is empty so
// the Feed and Wrapped have something to show (non-production only).
const DEMO_PALETTES = [
  ['#ff2d55', '#7928ca', '#0a0a0f'],
  ['#00f0ff', '#0055ff', '#05050a'],
  ['#f9f871', '#ff3d81', '#120018'],
  ['#00ffa3', '#0077ff', '#02060f'],
  ['#ff7a00', '#ff0055', '#0b0014'],
  ['#a18cd1', '#fbc2eb', '#0d0a14'],
  ['#43e97b', '#38f9d7', '#001018'],
  ['#fa709a', '#fee140', '#140010'],
];

function demoThumb(i, title) {
  const [a, b, c] = DEMO_PALETTES[i % DEMO_PALETTES.length];
  const angle = 120 + ((i * 47) % 120);
  const safeTitle = String(title || 'Reel').replace(/[<>&]/g, '');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">` +
    `<defs><linearGradient id="g" gradientTransform="rotate(${angle})">` +
    `<stop offset="0%" stop-color="${a}"/><stop offset="55%" stop-color="${b}"/><stop offset="100%" stop-color="${c}"/>` +
    `</linearGradient>` +
    `<radialGradient id="glow" cx="50%" cy="50%" r="55%">` +
    `<stop offset="0%" stop-color="#ffffff" stop-opacity="0.4"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>` +
    `</radialGradient></defs>` +
    `<rect width="540" height="960" fill="url(#g)"/>` +
    `<rect width="540" height="960" fill="url(#glow)"/>` +
    `<circle cx="${140 + i * 23}" cy="${300 + (i % 5) * 70}" r="${80 + (i % 4) * 30}" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="3"/>` +
    `<circle cx="${340 + (i % 3) * 30}" cy="${640 - (i % 4) * 50}" r="${36 + (i % 3) * 24}" fill="#ffffff" fill-opacity="0.16"/>` +
    `<text x="270" y="456" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="46" font-weight="700" letter-spacing="4" fill="#ffffff" fill-opacity="0.96">${safeTitle}</text>` +
    `<text x="270" y="510" text-anchor="middle" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="21" letter-spacing="6" fill="#ffffff" fill-opacity="0.6">REEL ${String(i + 1).padStart(2, '0')}</text>` +
    `<rect x="200" y="474" width="140" height="3" fill="#ffffff" fill-opacity="0.5"/>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function refreshDemoThumbs() {
  const rows = db
    .prepare("SELECT id, platform_video_id, title FROM videos WHERE platform_video_id LIKE 'demo-%'")
    .all();
  for (const r of rows) {
    const i = Number(String(r.platform_video_id).split('-')[1]) || 0;
    db.prepare('UPDATE videos SET thumbnail_url = ? WHERE id = ?').run(demoThumb(i, r.title), r.id);
  }
  return rows.length;
}

function seedDemoStats(uid) {
  if (db.prepare('SELECT COUNT(*) AS n FROM videos').get().n > 0) return false;
  const now = Date.now();
  const DAY = 86400000;
  try {
    const creators = ['Neon Drift Studio', 'Void Signal', 'Circuit Bloom', 'Ghost Runner', 'Prism Echo'];
    const creatorFor = (i) => {
      if (i <= 2 || i >= 12) return creators[0];
      if (i <= 4) return creators[1];
      if (i <= 6) return creators[2];
      if (i <= 8) return creators[3];
      return creators[4];
    };
    const titles = [
      'NEON DRIFT', 'SLOW SIGNAL', 'RAW ORBIT', 'ACID TIDE', 'GHOST FLUX',
      'ULTRA BLOOM', 'NIGHT RUNNER', 'PRISM ECHO', 'STATIC MIRAGE', 'PULSE WAVE',
      'FRACTURE GLASS', 'HYPER TIDE', 'VOID CIRCUIT', 'ECHO BLOOM',
    ];
    const vidIds = [];
    for (let i = 0; i < 14; i++) {
      const vid = id('vid');
      db.prepare(
        `INSERT INTO videos (id, platform, platform_video_id, creator_id, creator_name, title, description,
          thumbnail_url, source_url, published_at, duration, is_live, view_count, metadata, last_discovered_at, metadata_updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        vid,
        i < 8 ? 'youtube' : 'instagram',
        `demo-${i}`,
        `cr_${creatorFor(i).replace(/\s+/g, '_')}`,
        creatorFor(i),
        titles[i],
        `Demo reel: ${titles[i]}`,
        demoThumb(i, titles[i]),
        null,
        now - (i + 2) * DAY,
        30000 + i * 7000,
        0,
        120000 + i * 54000,
        '{}',
        now - (i + 2) * DAY,
        now
      );
      vidIds.push(vid);
    }

    const addInt = (videoIdx, type, daysAgo) => {
      db.prepare('INSERT INTO interactions (id, user_id, video_id, type, metadata, created_at) VALUES (?,?,?,?,?,?)').run(
        id('int'), uid, vidIds[videoIdx], type, '{}', now - daysAgo * DAY - Math.floor(Math.random() * 3600000)
      );
    };

    // 6-day active streak + history for top-creator ranking
    for (let d = 0; d < 6; d++) addInt(d % 7, 'opened', d);
    [[0, 12], [1, 20], [3, 25], [5, 30], [7, 40], [9, 60]].forEach(([v, d]) => addInt(v, 'opened', d));
    [[0, 3], [1, 10], [2, 15], [3, 18], [5, 22], [9, 35]].forEach(([v, d]) => addInt(v, 'saved', d));
    [[0, 6], [1, 7], [2, 8], [3, 9], [5, 14], [7, 26], [9, 45]].forEach(([v, d]) => addInt(v, 'watched', d));
    [4, 11, 19, 28].forEach((d, k) => addInt(k, 'searched', d));
    [12, 13, 21].forEach((d, k) => addInt(11 + (k % 3), 'not_interested', d));

    const mkCollection = (name, desc, idxs, dayOffsets) => {
      const cid = id('col');
      db.prepare(
        `INSERT INTO collections (id, owner_id, name, description, category, is_private, sort_order, created_at, updated_at)
         VALUES (?,?,?,?,?,0,0,?,?)`
      ).run(cid, uid, name, desc, 'demo', now - 40 * DAY, now);
      idxs.forEach((vi, k) => {
        db.prepare('INSERT INTO collection_items (id, collection_id, video_id, saved_at, sort_order, origin) VALUES (?,?,?,?,0,?)').run(
          id('item'), cid, vidIds[vi], now - dayOffsets[k] * DAY, 'manual'
        );
      });
    };
    mkCollection('Weekend Watchlist', 'Chill edits to watch on Saturdays', [0, 1, 2, 3, 5], [3, 10, 15, 18, 22]);
    mkCollection('Gym Reels', 'High-energy motivation', [9, 10, 11], [35, 42, 50]);
    return true;
  } catch {
    return false;
  }
}

app.post('/api/auth/demo-user', rateLimit('auth', 5, 60000), (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }
  const testEmail = 'demo@reelring.local';
  const testPassword = 'demo12345';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(testEmail);
  refreshDemoThumbs();
  if (existing) {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(testEmail);
    const ok = verifyPassword(testPassword, user.password_hash);
    seedDemoStats(user.id);
    return res.json({
      message: 'Demo user exists',
      email: testEmail,
      password: testPassword,
      passwordWorks: ok,
    });
  }
  const uid = id('usr');
  db.prepare('INSERT INTO users (id, email, password_hash, display_name, username, preferences, created_at) VALUES (?,?,?,?,?,?,?)').run(
    uid,
    testEmail,
    hashPassword(testPassword),
    'Demo User',
    generateUsername('demo-user'),
    JSON.stringify({ interests: [] }),
    Date.now()
  );
  seedDemoStats(uid);
  const session = createSession(uid);
  setSessionCookies(res, session);
  res.json({
    message: 'Demo user created',
    email: testEmail,
    password: testPassword,
    user: { id: uid, email: testEmail, displayName: 'Demo User' },
    csrfToken: session.csrfToken,
  });
});

// --- Creator Profile (public portfolio hub) ---

app.get('/api/profile/:username', (req, res) => {
  const username = String(req.params.username || '').toLowerCase().trim();
  const user = db
    .prepare('SELECT id, display_name, username, bio, accent_color, avatar_url, is_public, created_at FROM users WHERE username = ?')
    .get(username);
  if (!user) return res.status(404).json({ error: 'Profile not found' });

  const viewer = sessionFromRequest(req);
  const isOwner = viewer && viewer.user_id === user.id;
  if (!user.is_public && !isOwner) return res.status(404).json({ error: 'Profile not found' });

  const publicCollections = db
    .prepare(
      `SELECT id, name, description, category, sort_order FROM collections
       WHERE owner_id = ? AND is_private = 0 ORDER BY sort_order, created_at`
    )
    .all(user.id);
  const videoCount = db
    .prepare(
      `SELECT COUNT(DISTINCT ci.video_id) AS n FROM collection_items ci
       JOIN collections c ON c.id = ci.collection_id WHERE c.owner_id = ? AND c.is_private = 0`
    )
    .get(user.id).n;
  const platforms = db
    .prepare("SELECT DISTINCT platform FROM connected_accounts WHERE user_id = ? AND status = 'connected'")
    .all(user.id)
    .map((r) => r.platform);

  res.json({
    profile: {
      username: user.username,
      displayName: user.display_name,
      bio: user.bio || '',
      accentColor: user.accent_color || '#ff2d55',
      avatarUrl: user.avatar_url || '',
      isPublic: Boolean(user.is_public),
      createdAt: user.created_at,
      isOwner,
      videoCount,
      platforms,
      collections: publicCollections.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        category: c.category,
      })),
    },
  });
});

app.put('/api/profile', requireAuth, (req, res) => {
  const { username, bio, accentColor, avatarUrl, isPublic } = req.body || {};

  if (username !== undefined) {
    const clean = slugify(username);
    if (!clean || clean.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters (letters, numbers, dashes)' });
    const taken = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(clean, req.user.id);
    if (taken) return res.status(409).json({ error: 'That username is already taken' });
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(clean, req.user.id);
  }
  if (bio !== undefined) db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(String(bio).slice(0, 300), req.user.id);
  if (accentColor !== undefined && /^#[0-9a-fA-F]{6}$/.test(String(accentColor))) {
    db.prepare('UPDATE users SET accent_color = ? WHERE id = ?').run(String(accentColor), req.user.id);
  }
  if (avatarUrl !== undefined) db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(String(avatarUrl).slice(0, 500), req.user.id);
  if (isPublic !== undefined) db.prepare('UPDATE users SET is_public = ? WHERE id = ?').run(isPublic ? 1 : 0, req.user.id);

  const user = db
    .prepare('SELECT id, email, display_name, username, bio, accent_color, avatar_url, is_public, preferences FROM users WHERE id = ?')
    .get(req.user.id);
  res.json({
    profile: {
      username: user.username,
      displayName: user.display_name,
      bio: user.bio || '',
      accentColor: user.accent_color || '#ff2d55',
      avatarUrl: user.avatar_url || '',
      isPublic: Boolean(user.is_public),
    },
    user: { id: user.id, email: user.email, displayName: user.display_name },
    preferences: JSON.parse(user.preferences || '{}'),
  });
});

app.get('/api/profile/:username/videos', (req, res) => {
  const username = String(req.params.username || '').toLowerCase().trim();
  const user = db
    .prepare('SELECT id, username, is_public FROM users WHERE username = ?')
    .get(username);
  if (!user) return res.status(404).json({ error: 'Profile not found' });

  const viewer = sessionFromRequest(req);
  const isOwner = viewer && viewer.user_id === user.id;
  if (!user.is_public && !isOwner) return res.status(404).json({ error: 'Profile not found' });

  const rows = db
    .prepare(
      `SELECT v.* FROM collection_items ci
       JOIN collections c ON c.id = ci.collection_id
       JOIN videos v ON v.id = ci.video_id
       WHERE c.owner_id = ? AND c.is_private = 0
       ORDER BY v.published_at DESC
       LIMIT 100`
    )
    .all(user.id);

  res.json({
    username: user.username,
    videos: rows.map((r) => ({
      id: r.id,
      platform: r.platform,
      platformVideoId: r.platform_video_id,
      creatorName: r.creator_name,
      title: r.title,
      description: r.description,
      thumbnailUrl: r.thumbnail_url,
      sourceUrl: r.source_url,
      publishedAt: r.published_at,
      duration: r.duration,
      isLive: Boolean(r.is_live),
      viewCount: r.view_count,
    })),
  });
});

const pendingStates = new Map();

function makeState(userId, platform) {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { userId, platform, exp: Date.now() + 10 * 60 * 1000 });
  return state;
}

function makeGoogleState(userId, action = 'connect') {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { userId, platform: 'google', action, exp: Date.now() + 10 * 60 * 1000 });
  return state;
}

app.get('/api/oauth/google/start', requireAuth, (req, res) => {
  if (!google.isConfigured()) return res.status(503).json({ error: 'Google OAuth credentials not configured on this server' });
  const state = makeGoogleState(req.user.id, 'connect');
  return res.redirect(google.authorizeUrl(state));
});

app.get('/api/oauth/google/signin', (req, res) => {
  if (!google.isConfigured()) {
    return res.redirect('/index.html#social&status=' + encodeURIComponent('google_not_configured'));
  }
  const state = makeGoogleState(null, 'signin');
  return res.redirect(google.authorizeUrl(state));
});

app.get('/api/oauth/google/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  const entry = pendingStates.get(String(state || ''));
  pendingStates.delete(String(state || ''));
  const redirectTo = (msg) => res.redirect(`/index.html#social${msg ? `&status=${encodeURIComponent(msg)}` : ''}`);
  if (oauthError) return redirectTo(`oauth_error:${oauthError}`);
  if (!entry || entry.exp < Date.now() || entry.platform !== 'google') return redirectTo('invalid_state');
  if (!code) return redirectTo('missing_code');
  
  try {
    const tokens = await google.exchangeCode(String(code));
    const userInfo = await google.getUserInfo(tokens.access_token);
    const email = userInfo.email?.toLowerCase();
    const displayName = userInfo.name || email.split('@')[0];
    
    if (!email) return redirectTo('connect_failed:No email from Google');

    let user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    let isNewUser = false;
    
    if (!user) {
      const uid = id('usr');
      db.prepare('INSERT INTO users (id, email, password_hash, display_name, username, preferences, created_at) VALUES (?,?,?,?,?,?,?)').run(
        uid,
        email,
        'google-oauth', // placeholder, not used for Google OAuth users
        displayName,
        generateUsername(displayName),
        JSON.stringify({ interests: [] }),
        Date.now()
      );
      user = { id: uid, email, display_name: displayName };
      isNewUser = true;
    }
    
    const session = createSession(user.id);
    setSessionCookies(res, session);
    
    // If this was a signin action (not connect), just redirect
    if (entry.action === 'signin') {
      return res.redirect(`/index.html#social${isNewUser ? '&status=welcome' : ''}`);
    }
    
    // Otherwise, discover and auto-connect accounts
    const discovered = await google.discoverAccounts(tokens.access_token);
    let connected = [];
    
    for (const platform of ['youtube', 'instagram']) {
      for (const acc of discovered[platform] || []) {
        const platformClient = platform === 'youtube' ? youtube : instagram;
        if (!platformClient.isConfigured()) continue;
        
        const existing = db.prepare(
          'SELECT * FROM connected_accounts WHERE user_id = ? AND platform = ? AND platform_account_id = ?'
        ).get(user.id, platform, acc.platformAccountId);
        
        if (!existing) {
          const expiresAt = tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null;
          const envelope = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || null,
            expires_at: expiresAt,
          };
          
          db.prepare(
            `INSERT INTO connected_accounts
              (id, user_id, platform, platform_account_id, account_label, status, scopes, token_ref, token_expires_at, created_at)
             VALUES (?,?,?,?,?,'connected',?,?,?,?)
             ON CONFLICT(user_id, platform, platform_account_id) DO UPDATE SET
               status='connected', token_ref=excluded.token_ref, token_expires_at=excluded.token_expires_at,
               account_label=excluded.account_label, last_error=NULL`
          ).run(
            id('acc'),
            user.id,
            platform,
            acc.platformAccountId,
            acc.label,
            JSON.stringify(['google']),
            encryptToken(JSON.stringify(envelope)),
            expiresAt,
            Date.now()
          );
          
          connected.push({ platform, label: acc.label });
          sync.syncUserPlatform(user.id, platform).catch(() => {});
        }
      }
    }
    
    const msg = connected.length
      ? `auto_connected:${connected.map(c => `${c.platform}:${c.label}`).join(',')}`
      : 'connected:google (no linked accounts found)';
    return redirectTo(msg);
  } catch (err) {
    return redirectTo(`connect_failed:${err.message}`);
  }
});

// --- Instagram OAuth (connect + sign-in) ---

function makeIgState(userId, action) {
  const state = crypto.randomBytes(16).toString('hex');
  pendingStates.set(state, { userId, platform: 'instagram', action, exp: Date.now() + 10 * 60 * 1000 });
  return state;
}

app.get('/api/oauth/instagram/start', requireAuth, (req, res) => {
  if (!instagram.isConfigured()) {
    return res.redirect('/index.html#social&status=' + encodeURIComponent('ig_not_configured'));
  }
  return res.redirect(instagram.authorizeUrl(makeIgState(req.user.id, 'connect')));
});

app.get('/api/oauth/instagram/signin', (req, res) => {
  if (!instagram.isConfigured()) {
    return res.redirect('/index.html#social&status=' + encodeURIComponent('ig_not_configured'));
  }
  return res.redirect(instagram.authorizeUrl(makeIgState(null, 'signin')));
});

function upsertIgAccount(userId, ig) {
  const expiresAt = ig.expires_in ? Date.now() + ig.expires_in * 1000 : null;
  const envelope = {
    access_token: ig.access_token,
    refresh_token: null,
    expires_at: expiresAt,
  };
  db.prepare(
    `INSERT INTO connected_accounts
      (id, user_id, platform, platform_account_id, account_label, status, scopes, token_ref, token_expires_at, created_at)
     VALUES (?,?, 'instagram', ?,?, 'connected', ?, ?, ?, ?)
     ON CONFLICT(user_id, platform, platform_account_id) DO UPDATE SET
       status='connected', token_ref=excluded.token_ref, token_expires_at=excluded.token_expires_at,
       account_label=excluded.account_label, last_error=NULL`
  ).run(
    id('acc'),
    userId,
    ig.platformAccountId,
    ig.label,
    JSON.stringify(['instagram_login']),
    encryptToken(JSON.stringify(envelope)),
    expiresAt,
    Date.now()
  );
}

app.get('/api/oauth/instagram/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  const entry = pendingStates.get(String(state || ''));
  pendingStates.delete(String(state || ''));
  const redirectTo = (msg) => res.redirect(`/index.html#social${msg ? `&status=${encodeURIComponent(msg)}` : ''}`);
  if (oauthError) return redirectTo(`oauth_error:${oauthError}`);
  if (!entry || entry.exp < Date.now() || entry.platform !== 'instagram') return redirectTo('invalid_state');
  if (!code) return redirectTo('missing_code');

  try {
    const tokens = await instagram.exchangeCode(String(code));
    const account = await instagram.getMe(tokens.access_token, quota);
    let userInfo = { id: null, name: null, email: null };
    try {
      userInfo = await instagram.getUserInfo(tokens.access_token);
    } catch {}

    let user = null;
    let isNewUser = false;

    if (entry.action === 'signin') {
      const email = (userInfo.email || `${account.platformAccountId}@instagram.reelring.local`).toLowerCase();
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user) {
        const uid = id('usr');
        const displayName = userInfo.name || `@${account.platformAccountId}`;
        db.prepare(
          'INSERT INTO users (id, email, password_hash, display_name, username, preferences, created_at) VALUES (?,?,?,?,?,?,?)'
        ).run(uid, email, 'instagram-oauth', displayName, generateUsername(displayName), JSON.stringify({ interests: [] }), Date.now());
        user = { id: uid, email, display_name: displayName };
        isNewUser = true;
      }
      const session = createSession(user.id);
      setSessionCookies(res, session);
    } else {
      user = db.prepare('SELECT id, email, display_name FROM users WHERE id = ?').get(entry.userId);
      if (!user) return redirectTo('invalid_state');
    }

    upsertIgAccount(user.id, {
      access_token: tokens.access_token,
      expires_in: tokens.expires_in,
      platformAccountId: account.platformAccountId,
      label: account.label,
    });

    sync.syncUserPlatform(user.id, 'instagram').catch(() => {});

    if (entry.action === 'signin') {
      return redirectTo(`ig_signin:${account.label}${isNewUser ? ':new' : ''}`);
    }
    return redirectTo(`auto_connected:instagram:${account.label}`);
  } catch (err) {
    return redirectTo(`connect_failed:${err.message}`);
  }
});

app.get('/api/accounts', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT id, platform, platform_account_id, account_label, status, last_sync_at, last_error, token_expires_at FROM connected_accounts WHERE user_id = ?')
    .all(req.user.id);
  const health = rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    platformAccountId: r.platform_account_id,
    label: r.account_label,
    status: r.last_error ? 'error' : r.status,
    lastSyncAt: r.last_sync_at,
    lastError: r.last_error,
    tokenExpiresAt: r.token_expires_at,
    tokenExpiringSoon: r.token_expires_at ? r.token_expires_at - Date.now() < 7 * 86400000 : false,
  }));
  res.json({
    accounts: health,
    configured: { youtube: youtube.isConfigured(), instagram: instagram.isConfigured() },
    limitations: {
      instagram: instagram.LIMITATION_NOTE,
      youtube: 'YouTube Data API quota applies; search costs 100 units per request.',
    },
  });
});

app.delete('/api/accounts/:platform/:accountId', requireAuth, async (req, res) => {
  const row = db
    .prepare('SELECT * FROM connected_accounts WHERE id = ? AND user_id = ? AND platform = ?')
    .get(req.params.accountId, req.user.id, req.params.platform);
  if (!row) return res.status(404).json({ error: 'Account not found' });
  try {
    const tokens = JSON.parse(decryptToken(row.token_ref));
    const client = row.platform === 'youtube' ? youtube : instagram;
    if (tokens.access_token && client.revokeToken) await client.revokeToken(tokens.access_token);
  } catch {}
  db.prepare('DELETE FROM connected_accounts WHERE id = ? AND user_id = ?').run(row.id, req.user.id);
  feedLib.setSyncStatus(req.user.id, row.platform, { status: 'disconnected', error: null });
  res.json({ ok: true });
});

app.get('/api/feed', requireAuth, (req, res) => {
  const { category = 'latest', platform = 'all', limit = 40, offset = 0 } = req.query;
  const feed = feedLib.getFeed(req.user.id, {
    category: String(category),
    platform: String(platform),
    limit: Math.min(100, Number(limit) || 40),
    offset: Number(offset) || 0,
  });
  const status = feedLib.syncStatus(req.user.id);
  res.json({ ...feed, syncStatus: status });
});

app.post('/api/feed/refresh', requireAuth, async (req, res) => {
  const platform = String(req.body?.platform || 'all');
  const targets = platform === 'all' ? ['youtube', 'instagram'] : [platform];
  const results = [];
  for (const p of targets) {
    if (!['youtube', 'instagram'].includes(p)) continue;
    results.push({ platform: p, ...(await sync.syncUserPlatform(req.user.id, p)) });
  }
  res.json({ results, syncStatus: feedLib.syncStatus(req.user.id) });
});

app.get('/api/feed/status', requireAuth, (req, res) => {
  res.json({
    syncStatus: feedLib.syncStatus(req.user.id),
    quota: { youtube: quota.snapshot('youtube'), instagram: quota.snapshot('instagram') },
  });
});

function storeVideos(videoList) {
  return sync.upsertVideos(videoList);
}

app.get('/api/search', requireAuth, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const platform = String(req.query.platform || 'youtube');
  if (!q) return res.status(400).json({ error: 'Search query required' });

  const limitations = [];
  const videos = [];

  if (platform === 'youtube' || platform === 'all') {
    const accounts = db
      .prepare("SELECT * FROM connected_accounts WHERE user_id = ? AND platform = 'youtube' AND status='connected'")
      .all(req.user.id);
    if (!youtube.isConfigured()) {
      limitations.push({ platform: 'youtube', message: 'YouTube API credentials are not configured on this server.' });
    } else if (!accounts.length) {
      limitations.push({ platform: 'youtube', message: 'Connect a YouTube account to search via the official API.' });
    } else {
      try {
        const tokens = JSON.parse(decryptToken(accounts[0].token_ref));
        const result = await youtube.searchVideos(tokens.access_token, q, quota, {
          maxResults: Math.min(25, Number(req.query.limit) || 12),
        });
        const dbIds = storeVideos(result.videos);
        videos.push(...result.videos.map((v, i) => ({ ...v, dbId: dbIds[i] })));
      } catch (err) {
        limitations.push({ platform: 'youtube', message: `YouTube search failed: ${err.message}` });
      }
    }
  }

  if (platform === 'instagram' || platform === 'all') {
    limitations.push({ platform: 'instagram', message: instagram.LIMITATION_NOTE });
    const accounts = db
      .prepare("SELECT * FROM connected_accounts WHERE user_id = ? AND platform = 'instagram' AND status='connected'")
      .all(req.user.id);
    if (accounts.length && instagram.isConfigured()) {
      try {
        const tokens = JSON.parse(decryptToken(accounts[0].token_ref));
        const result = await instagram.getMyMedia(tokens.access_token, accounts[0].platform_account_id, quota, { limit: 24 });
        const qLower = q.toLowerCase();
        const matched = result.videos.filter(
          (v) => (v.title || '').toLowerCase().includes(qLower) || (v.description || '').toLowerCase().includes(qLower)
        );
        const dbIds = storeVideos(matched);
        videos.push(...matched.map((v, i) => ({ ...v, dbId: dbIds[i] })));
      } catch (err) {
        limitations.push({ platform: 'instagram', message: `Instagram media fetch failed: ${err.message}` });
      }
    }
  }

  const unique = new Map();
  for (const v of videos) {
    const k = `${v.platform}::${v.platformVideoId}`;
    if (!unique.has(k)) unique.set(k, v);
  }
  res.json({ query: q, videos: [...unique.values()], limitations });
});

app.get('/api/collections', requireAuth, (req, res) => {
  res.json({ collections: collections.listCollections(req.user.id) });
});

app.post('/api/collections', requireAuth, (req, res) => {
  try {
    res.status(201).json({ collection: collections.createCollection(req.user.id, req.body || {}) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.patch('/api/collections/:id', requireAuth, (req, res) => {
  try {
    res.json({ collection: collections.updateCollection(req.user.id, req.params.id, req.body || {}) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/collections/:id', requireAuth, (req, res) => {
  try {
    collections.deleteCollection(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/collections/:id/items', requireAuth, (req, res) => {
  try {
    const { sort = 'newest', q = '' } = req.query;
    res.json({ items: collections.getItems(req.user.id, req.params.id, { sort: String(sort), q: String(q) }) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/collections/:id/items', requireAuth, (req, res) => {
  try {
    const { videoId } = req.body || {};
    collections.addVideoToCollection(req.user.id, req.params.id, videoId);
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/collections/:id/items/:videoId', requireAuth, (req, res) => {
  try {
    collections.removeVideoFromCollection(req.user.id, req.params.id, req.params.videoId);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/collections/:id/rules', requireAuth, (req, res) => {
  try {
    res.json({ rules: collections.listRules(req.user.id, req.params.id) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/collections/:id/rules', requireAuth, (req, res) => {
  try {
    res.status(201).json({ rule: collections.createRule(req.user.id, req.params.id, req.body || {}) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.patch('/api/rules/:id', requireAuth, (req, res) => {
  try {
    res.json({ rule: collections.updateRule(req.user.id, req.params.id, req.body || {}) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/rules/:id', requireAuth, (req, res) => {
  try {
    collections.deleteRule(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get('/api/collections/:id/matches', requireAuth, (req, res) => {
  try {
    res.json({ matches: collections.newMatches(req.user.id, req.params.id) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/collections/:id/matches/:matchId/accept', requireAuth, (req, res) => {
  try {
    collections.acceptMatch(req.user.id, req.params.id, req.params.matchId, { alsoSave: req.body?.alsoSave !== false });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/collections/:id/matches/:matchId/dismiss', requireAuth, (req, res) => {
  try {
    collections.dismissMatch(req.user.id, req.params.id, req.params.matchId);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/interactions', requireAuth, (req, res) => {
  const { videoId, type, metadata } = req.body || {};
  if (!videoId || !['opened', 'saved', 'not_interested', 'searched', 'watched'].includes(type)) {
    return res.status(400).json({ error: 'videoId and valid type required' });
  }
  const video = db.prepare('SELECT id FROM videos WHERE id = ?').get(videoId);
  if (!video) return res.status(404).json({ error: 'Video not found' });
  db.prepare('INSERT INTO interactions (id, user_id, video_id, type, metadata, created_at) VALUES (?,?,?,?,?,?)').run(
    id('int'),
    req.user.id,
    videoId,
    type,
    JSON.stringify(metadata || {}),
    Date.now()
  );
  res.status(201).json({ ok: true });
});

app.get('/api/recommendations', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM videos ORDER BY last_discovered_at DESC LIMIT 300').all();
  const videos = rows.map((r) => ({
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
    lastDiscoveredAt: r.last_discovered_at,
  }));
  const intRows = db.prepare('SELECT video_id AS videoId, type FROM interactions WHERE user_id = ?').all(req.user.id);
  const prefs = JSON.parse(req.user.preferences || '{}');
  res.json({ items: recommendFeed(videos, intRows, prefs.interests || [], 30) });
});

// --- REELRING Wrapped: shareable activity stats ---
app.get('/api/wrapped', requireAuth, (req, res) => {
  const period = ['year', '30d', 'all'].includes(String(req.query.period)) ? String(req.query.period) : 'year';
  const now = Date.now();
  const since =
    period === 'all'
      ? 0
      : period === '30d'
        ? now - 30 * 86400000
        : new Date(new Date().getFullYear(), 0, 1).getTime();

  const uid = req.user.id;

  const typeCounts = {};
  for (const r of db.prepare('SELECT type, COUNT(*) AS c FROM interactions WHERE user_id = ? AND created_at >= ? GROUP BY type').all(uid, since)) {
    typeCounts[r.type] = r.c;
  }

  const savesInPeriod = db
    .prepare(
      `SELECT COUNT(*) AS n FROM collection_items ci
       JOIN collections c ON c.id = ci.collection_id
       WHERE c.owner_id = ? AND ci.saved_at >= ?`
    )
    .get(uid, since).n;

  const topCreators = db
    .prepare(
      `SELECT v.creator_name AS name, COUNT(*) AS cnt
       FROM interactions i JOIN videos v ON v.id = i.video_id
       WHERE i.user_id = ? AND i.created_at >= ?
         AND i.type IN ('opened','saved','watched') AND v.creator_name IS NOT NULL AND v.creator_name != ''
       GROUP BY v.creator_name ORDER BY cnt DESC LIMIT 5`
    )
    .all(uid, since)
    .map((r) => ({ name: r.name, count: r.cnt }));

  const platformRows = db
    .prepare(
      `SELECT v.platform AS p, COUNT(*) AS cnt
       FROM interactions i JOIN videos v ON v.id = i.video_id
       WHERE i.user_id = ? AND i.created_at >= ? AND i.type IN ('opened','saved','watched')
       GROUP BY v.platform`
    )
    .all(uid, since);
  const platforms = { youtube: 0, instagram: 0 };
  for (const r of platformRows) if (r.p in platforms) platforms[r.p] = r.cnt;

  const topCollection = db
    .prepare(
      `SELECT c.name AS name, COUNT(*) AS cnt FROM collection_items ci
       JOIN collections c ON c.id = ci.collection_id
       WHERE c.owner_id = ? AND ci.saved_at >= ?
       GROUP BY c.id ORDER BY cnt DESC LIMIT 1`
    )
    .get(uid, since);

  const watchedMs = db
    .prepare(
      `SELECT COALESCE(SUM(v.duration), 0) AS s FROM interactions i
       JOIN videos v ON v.id = i.video_id
       WHERE i.user_id = ? AND i.created_at >= ? AND i.type = 'watched' AND v.duration IS NOT NULL`
    )
    .get(uid, since).s;

  // Longest streak of consecutive active days
  const days = [
    ...new Set(
      db
        .prepare('SELECT created_at FROM interactions WHERE user_id = ? AND created_at >= ?')
        .all(uid, since)
        .map((r) => Math.floor(r.created_at / 86400000))
    ),
  ].sort((a, b) => a - b);
  let streak = days.length ? 1 : 0;
  let best = days.length ? 1 : 0;
  for (let i = 1; i < days.length; i++) {
    if (days[i] === days[i - 1] + 1) {
      best += 1;
      if (best > streak) streak = best;
    } else {
      best = 1;
    }
  }

  const librarySize = db.prepare('SELECT COUNT(*) AS n FROM videos').get().n;
  const collectionCount = db.prepare('SELECT COUNT(*) AS n FROM collections WHERE owner_id = ?').get(uid).n;
  const userRow = db.prepare('SELECT username, display_name, created_at FROM users WHERE id = ?').get(uid);

  res.json({
    period,
    since,
    username: userRow.username,
    displayName: userRow.display_name,
    memberSince: userRow.created_at,
    counts: {
      opened: typeCounts.opened || 0,
      saved: typeCounts.saved || 0,
      watched: typeCounts.watched || 0,
      searched: typeCounts.searched || 0,
      notInterested: typeCounts.not_interested || 0,
    },
    savesInPeriod,
    librarySize,
    collectionCount,
    topCreators,
    platforms,
    topCollection: topCollection ? { name: topCollection.name, count: topCollection.cnt } : null,
    watchMinutes: Math.round(watchedMs / 60000),
    streakDays: streak,
  });
});

const distDir = path.join(__dirname, '..', 'dist');
app.use(express.static(distDir));
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) res.status(404).send('Build the frontend first: npm run build');
  });
});

app.use((err, req, res, next) => {
  console.error('[server]', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`social api on http://localhost:${PORT}`);
    console.log(`youtube configured: ${youtube.isConfigured()} | instagram configured: ${instagram.isConfigured()}`);
    try {
      const n = refreshDemoThumbs();
      if (n) console.log(`demo thumbnails restored: ${n}`);
    } catch {}
    // sync.startWorker(); // disabled for testing
  });
}

module.exports = { app, quota };
