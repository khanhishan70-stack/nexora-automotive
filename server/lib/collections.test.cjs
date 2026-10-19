const { describe, it, expect, beforeEach, afterAll } = require('vitest');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.APP_ENCRYPTION_KEY = 'test-key';

const { db, id } = require('../db.js');
const collections = require('./collections.js');
const { getFeed } = require('./feed.js');
const { upsertVideos } = require('../sync.js');
const { normalizeVideo } = require('./normalize.js');
const { hashPassword, verifyPassword, encryptToken, decryptToken } = require('./crypto.js');

let userId;
let otherUserId;

function makeUser(email) {
  const uid = id('usr');
  db.prepare('INSERT INTO users (id, email, password_hash, preferences, created_at) VALUES (?,?,?,?,?)').run(
    uid,
    email,
    hashPassword('password123'),
    JSON.stringify({ interests: [] }),
    Date.now()
  );
  return uid;
}

beforeEach(() => {
  db.exec('DELETE FROM rule_matches; DELETE FROM discovery_rules; DELETE FROM collection_items; DELETE FROM collections; DELETE FROM interactions; DELETE FROM videos; DELETE FROM feed_sync; DELETE FROM connected_accounts; DELETE FROM sessions; DELETE FROM users;');
  userId = makeUser('owner@test.local');
  otherUserId = makeUser('other@test.local');
});

afterAll(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('passwords + token encryption', () => {
  it('verifies correct password only', () => {
    const h = hashPassword('secret-pass');
    expect(verifyPassword('secret-pass', h)).toBe(true);
    expect(verifyPassword('wrong', h)).toBe(false);
  });

  it('round-trips token encryption', () => {
    const token = 'ya29.super-secret-token';
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it('does not decrypt with a different key', () => {
    const payload = encryptToken('token');
    process.env.APP_ENCRYPTION_KEY = 'other-key';
    expect(() => decryptToken(payload)).toThrow();
    process.env.APP_ENCRYPTION_KEY = 'test-key';
  });
});

describe('collections', () => {
  it('creates, renames and deletes', () => {
    const c = collections.createCollection(userId, { name: 'AI Learning', description: 'tutorials' });
    expect(c.name).toBe('AI Learning');
    expect(c.isPrivate).toBe(true);
    const updated = collections.updateCollection(userId, c.id, { name: 'AI News' });
    expect(updated.name).toBe('AI News');
    collections.deleteCollection(userId, c.id);
    expect(collections.listCollections(userId)).toHaveLength(0);
  });

  it('rejects duplicate names per owner', () => {
    collections.createCollection(userId, { name: 'Gaming' });
    expect(() => collections.createCollection(userId, { name: 'Gaming' })).toThrow(/already have/);
  });

  it('enforces ownership — another user cannot read or mutate', () => {
    const c = collections.createCollection(userId, { name: 'Private mix' });
    expect(() => collections.updateCollection(otherUserId, c.id, { name: 'hacked' })).toThrow(/not found/);
    expect(() => collections.deleteCollection(otherUserId, c.id)).toThrow(/not found/);
    expect(() => collections.getItems(otherUserId, c.id)).toThrow(/not found/);
    expect(collections.listCollections(otherUserId)).toHaveLength(0);
  });

  it('saves and removes videos, dedupes re-saves', () => {
    const [vid] = upsertVideos([normalizeVideo('youtube', { platformVideoId: 'v1', title: 'React in 100s' })]);
    const c = collections.createCollection(userId, { name: 'Programming' });
    collections.addVideoToCollection(userId, c.id, vid);
    expect(() => collections.addVideoToCollection(userId, c.id, vid)).toThrow(/already in/);
    const items = collections.getItems(userId, c.id);
    expect(items).toHaveLength(1);
    collections.removeVideoFromCollection(userId, c.id, vid);
    expect(collections.getItems(userId, c.id)).toHaveLength(0);
  });

  it('sorts and searches within a collection', () => {
    const ids = upsertVideos([
      normalizeVideo('youtube', { platformVideoId: 'old', title: 'Python basics', publishedAt: '2025-01-01T00:00:00Z' }),
      normalizeVideo('youtube', { platformVideoId: 'new', title: 'Python AI', publishedAt: '2026-09-01T00:00:00Z' }),
    ]);
    const c = collections.createCollection(userId, { name: 'Study' });
    for (const v of ids) collections.addVideoToCollection(userId, c.id, v);

    const newest = collections.getItems(userId, c.id, { sort: 'newest' });
    expect(newest[0].video.platformVideoId).toBe('new');

    const oldest = collections.getItems(userId, c.id, { sort: 'oldest' });
    expect(oldest[0].video.platformVideoId).toBe('old');

    const searched = collections.getItems(userId, c.id, { q: 'AI' });
    expect(searched).toHaveLength(1);
  });

  it('discovery rules are separate from manual items and matches need approval', () => {
    const c = collections.createCollection(userId, { name: 'AI News' });
    const rule = collections.createRule(userId, c.id, { searchTerms: ['AI news'], platforms: ['youtube'] });
    expect(rule.enabled).toBe(true);

    const [vid] = upsertVideos([normalizeVideo('youtube', { platformVideoId: 'auto1', title: 'AI news daily' })]);
    collections.recordMatch(rule.id, vid);

    // match exists, but collection items stay empty until accepted
    expect(collections.getItems(userId, c.id)).toHaveLength(0);
    const matches = collections.newMatches(userId, c.id);
    expect(matches).toHaveLength(1);

    collections.acceptMatch(userId, c.id, matches[0].matchId, { alsoSave: true });
    expect(collections.getItems(userId, c.id)).toHaveLength(1);
    expect(collections.newMatches(userId, c.id)).toHaveLength(0);
  });

  it('pause and resume a rule', () => {
    const c = collections.createCollection(userId, { name: 'Cars' });
    const rule = collections.createRule(userId, c.id, { searchTerms: ['supercars'] });
    collections.updateRule(userId, rule.id, { enabled: false });
    expect(collections.listRules(userId, c.id)[0].enabled).toBe(false);
    collections.updateRule(userId, rule.id, { enabled: true });
    expect(collections.listRules(userId, c.id)[0].enabled).toBe(true);
  });

  it('rulesDue only returns enabled rules past their interval', () => {
    const c = collections.createCollection(userId, { name: 'Live Gaming' });
    const rule = collections.createRule(userId, c.id, { searchTerms: ['live'], frequencyMinutes: 60 });
    const dueNow = collections.rulesDue(Date.now() + 1);
    expect(dueNow.some((r) => r.id === rule.id)).toBe(true);
    collections.touchRule(rule.id);
    const dueSoon = collections.rulesDue(Date.now() + 60000);
    expect(dueSoon.some((r) => r.id === rule.id)).toBe(false);
  });
});

describe('unified feed', () => {
  it('dedupes platform+id and filters by platform', () => {
    upsertVideos([
      normalizeVideo('youtube', { platformVideoId: 'x', title: 'YT' }),
      normalizeVideo('instagram', { platformVideoId: 'x', title: 'IG' }),
      normalizeVideo('youtube', { platformVideoId: 'x', title: 'YT dup' }),
    ]);
    const all = getFeed(userId, { category: 'latest', platform: 'all' });
    expect(all.items).toHaveLength(2);
    const ytOnly = getFeed(userId, { category: 'latest', platform: 'youtube' });
    expect(ytOnly.items).toHaveLength(1);
    expect(ytOnly.items[0].title).toBe('YT');
  });

  it('live category only shows is_live videos', () => {
    upsertVideos([
      normalizeVideo('youtube', { platformVideoId: 'live1', title: 'Stream', isLive: true }),
      normalizeVideo('youtube', { platformVideoId: 'vod', title: 'Old', isLive: false }),
    ]);
    const feed = getFeed(userId, { category: 'live' });
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].isLive).toBe(true);
  });

  it('trending requires view counts and ranks by velocity', () => {
    const nowIso = new Date().toISOString();
    upsertVideos([
      normalizeVideo('youtube', { platformVideoId: 'big', title: 'Big', viewCount: 5000000, publishedAt: nowIso }),
      normalizeVideo('youtube', { platformVideoId: 'small', title: 'Small', viewCount: 10, publishedAt: nowIso }),
      normalizeVideo('youtube', { platformVideoId: 'noviews', title: 'No data', viewCount: null, publishedAt: nowIso }),
    ]);
    const feed = getFeed(userId, { category: 'trending' });
    expect(feed.items.map((v) => v.platformVideoId)).toEqual(['big', 'small']);
  });

  it('live status flips when metadata refreshes', () => {
    upsertVideos([normalizeVideo('youtube', { platformVideoId: 'flip', title: 'Stream', isLive: true })]);
    expect(getFeed(userId, { category: 'live' }).items).toHaveLength(1);
    upsertVideos([normalizeVideo('youtube', { platformVideoId: 'flip', title: 'Stream', isLive: false })]);
    expect(getFeed(userId, { category: 'live' }).items).toHaveLength(0);
  });

  it('for-you prefers interacted creators', () => {
    const ids = upsertVideos([
      normalizeVideo('youtube', { platformVideoId: 'fav', title: 'From fav', creatorId: 'favchan' }),
      normalizeVideo('youtube', { platformVideoId: 'rand', title: 'Random', creatorId: 'otherchan' }),
    ]);
    db.prepare('INSERT INTO interactions (id, user_id, video_id, type, metadata, created_at) VALUES (?,?,?,?,?,?)').run(
      id('int'),
      userId,
      ids[0],
      'saved',
      '{}',
      Date.now()
    );
    const feed = getFeed(userId, { category: 'for-you' });
    expect(feed.items[0].platformVideoId).toBe('fav');
  });
});