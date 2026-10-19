const crypto = require('node:crypto');
const { db, id } = require('../db.cjs');

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, SCRYPT_OPTS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length, SCRYPT_OPTS);
  return crypto.timingSafeEqual(actual, expected);
}

function encKey() {
  const base = process.env.APP_ENCRYPTION_KEY || 'dev-only-insecure-key-change-me!!';
  return crypto.createHash('sha256').update(base).digest();
}

function encryptToken(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${data.toString('base64')}`;
}

function decryptToken(payload) {
  const [v, ivB64, tagB64, dataB64] = String(payload).split('.');
  if (v !== 'v1') throw new Error('bad token envelope');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

function createSession(userId) {
  const sid = id('ses');
  const csrf = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (id, user_id, csrf_token, created_at, expires_at) VALUES (?,?,?,?,?)'
  ).run(sid, userId, csrf, now, now + 1000 * 60 * 60 * 24 * 30);
  return { sessionId: sid, csrfToken: csrf };
}

function getSession(sessionId) {
  if (!sessionId) return null;
  const row = db
    .prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?')
    .get(sessionId, Date.now());
  return row || null;
}

function destroySession(sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies.rr_session;
  return getSession(sid);
}

module.exports = {
  hashPassword,
  verifyPassword,
  encryptToken,
  decryptToken,
  createSession,
  getSession,
  destroySession,
  parseCookies,
  sessionFromRequest,
};
