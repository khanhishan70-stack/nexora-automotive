const { db, id } = require('../db.cjs');

function ownedCollection(userId, collectionId) {
  const row = db.prepare('SELECT * FROM collections WHERE id = ? AND owner_id = ?').get(collectionId, userId);
  return row || null;
}

function listCollections(userId) {
  return db
    .prepare('SELECT * FROM collections WHERE owner_id = ? ORDER BY sort_order, created_at')
    .all(userId)
    .map(mapCollection);
}

function mapCollection(r) {
  const itemCount = db
    .prepare('SELECT COUNT(*) AS n FROM collection_items WHERE collection_id = ?')
    .get(r.id).n;
  const ruleCount = db.prepare('SELECT COUNT(*) AS n FROM discovery_rules WHERE collection_id = ?').get(r.id).n;
  const pendingMatches = db
    .prepare(
      `SELECT COUNT(*) AS n FROM rule_matches rm
       JOIN discovery_rules dr ON dr.id = rm.rule_id
       WHERE dr.collection_id = ? AND rm.dismissed = 0`
    )
    .get(r.id).n;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    category: r.category,
    isPrivate: Boolean(r.is_private),
    itemCount,
    ruleCount,
    pendingMatches,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function createCollection(userId, { name, description, category, isPrivate = true }) {
  if (!name || !name.trim()) throw Object.assign(new Error('Collection name is required'), { status: 400 });
  const now = Date.now();
  const cid = id('col');
  try {
    db.prepare(
      `INSERT INTO collections (id, owner_id, name, description, category, is_private, sort_order, created_at, updated_at)
       VALUES (?,?,?,?,?,?,0,?,?)`
    ).run(cid, userId, name.trim(), description || null, category || null, isPrivate ? 1 : 0, now, now);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      throw Object.assign(new Error('You already have a collection with that name'), { status: 409 });
    }
    throw e;
  }
  return mapCollection(db.prepare('SELECT * FROM collections WHERE id = ?').get(cid));
}

function updateCollection(userId, collectionId, patch) {
  const col = ownedCollection(userId, collectionId);
  if (!col) throw Object.assign(new Error('Collection not found'), { status: 404 });
  db.prepare(
    `UPDATE collections SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      category = COALESCE(?, category),
      is_private = COALESCE(?, is_private),
      updated_at = ?
     WHERE id = ? AND owner_id = ?`
  ).run(
    patch.name !== undefined ? String(patch.name).trim() : null,
    patch.description !== undefined ? patch.description : null,
    patch.category !== undefined ? patch.category : null,
    patch.isPrivate !== undefined ? (patch.isPrivate ? 1 : 0) : null,
    Date.now(),
    collectionId,
    userId
  );
  return mapCollection(db.prepare('SELECT * FROM collections WHERE id = ?').get(collectionId));
}

function deleteCollection(userId, collectionId) {
  const col = ownedCollection(userId, collectionId);
  if (!col) throw Object.assign(new Error('Collection not found'), { status: 404 });
  db.prepare('DELETE FROM collections WHERE id = ? AND owner_id = ?').run(collectionId, userId);
}

function getItems(userId, collectionId, { sort = 'newest', q = '' } = {}) {
  const col = ownedCollection(userId, collectionId);
  if (!col) throw Object.assign(new Error('Collection not found'), { status: 404 });
  let sql = `
    SELECT ci.saved_at, ci.origin, ci.sort_order, v.* FROM collection_items ci
    JOIN videos v ON v.id = ci.video_id
    WHERE ci.collection_id = ?`;
  const params = [collectionId];
  if (q.trim()) {
    sql += ' AND (v.title LIKE ? OR v.description LIKE ? OR v.creator_name LIKE ?)';
    const like = `%${q.trim()}%`;
    params.push(like, like, like);
  }
  if (sort === 'oldest') sql += ' ORDER BY v.published_at ASC, ci.saved_at ASC';
  else if (sort === 'recently-saved') sql += ' ORDER BY ci.saved_at DESC';
  else sql += ' ORDER BY v.published_at DESC';
  const rows = db.prepare(sql).all(...params);
  return rows.map((r) => ({
    savedAt: r.saved_at,
    origin: r.origin,
    video: {
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
    },
  }));
}

function addVideoToCollection(userId, collectionId, videoDbId, origin = 'manual') {
  const col = ownedCollection(userId, collectionId);
  if (!col) throw Object.assign(new Error('Collection not found'), { status: 404 });
  const video = db.prepare('SELECT id FROM videos WHERE id = ?').get(videoDbId);
  if (!video) throw Object.assign(new Error('Video not found'), { status: 404 });
  try {
    db.prepare(
      'INSERT INTO collection_items (id, collection_id, video_id, saved_at, sort_order, origin) VALUES (?,?,?,?,0,?)'
    ).run(id('item'), collectionId, videoDbId, Date.now(), origin);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      throw Object.assign(new Error('Video is already in this collection'), { status: 409 });
    }
    throw e;
  }
  db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(Date.now(), collectionId);
}

function removeVideoFromCollection(userId, collectionId, videoDbId) {
  const col = ownedCollection(userId, collectionId);
  if (!col) throw Object.assign(new Error('Collection not found'), { status: 404 });
  db.prepare('DELETE FROM collection_items WHERE collection_id = ? AND video_id = ?').run(collectionId, videoDbId);
  db.prepare('UPDATE collections SET updated_at = ? WHERE id = ?').run(Date.now(), collectionId);
}

function createRule(userId, collectionId, payload) {
  const col = ownedCollection(userId, collectionId);
  if (!col) throw Object.assign(new Error('Collection not found'), { status: 404 });
  const rid = id('rule');
  db.prepare(
    `INSERT INTO discovery_rules
      (id, owner_id, collection_id, name, search_terms, platforms, channel_ids, frequency_minutes, enabled, created_at)
     VALUES (?,?,?,?,?,?,?,?,1,?)`
  ).run(
    rid,
    userId,
    collectionId,
    payload.name || 'Auto-discovery',
    JSON.stringify(payload.searchTerms || []),
    JSON.stringify(payload.platforms || ['youtube']),
    JSON.stringify(payload.channelIds || []),
    Math.max(30, Number(payload.frequencyMinutes) || 360),
    Date.now()
  );
  return mapRule(db.prepare('SELECT * FROM discovery_rules WHERE id = ?').get(rid));
}

function mapRule(r) {
  return {
    id: r.id,
    collectionId: r.collection_id,
    name: r.name,
    searchTerms: JSON.parse(r.search_terms || '[]'),
    platforms: JSON.parse(r.platforms || '[]'),
    channelIds: JSON.parse(r.channel_ids || '[]'),
    frequencyMinutes: r.frequency_minutes,
    enabled: Boolean(r.enabled),
    lastRunAt: r.last_run_at,
    lastError: r.last_error,
  };
}

function listRules(userId, collectionId) {
  const col = ownedCollection(userId, collectionId);
  if (!col) throw Object.assign(new Error('Collection not found'), { status: 404 });
  return db.prepare('SELECT * FROM discovery_rules WHERE collection_id = ?').all(collectionId).map(mapRule);
}

function updateRule(userId, ruleId, patch) {
  const rule = db.prepare('SELECT * FROM discovery_rules WHERE id = ? AND owner_id = ?').get(ruleId, userId);
  if (!rule) throw Object.assign(new Error('Rule not found'), { status: 404 });
  db.prepare(
    `UPDATE discovery_rules SET
      name = COALESCE(?, name),
      search_terms = COALESCE(?, search_terms),
      platforms = COALESCE(?, platforms),
      channel_ids = COALESCE(?, channel_ids),
      frequency_minutes = COALESCE(?, frequency_minutes),
      enabled = COALESCE(?, enabled),
      last_error = ?
     WHERE id = ? AND owner_id = ?`
  ).run(
    patch.name !== undefined ? patch.name : null,
    patch.searchTerms !== undefined ? JSON.stringify(patch.searchTerms) : null,
    patch.platforms !== undefined ? JSON.stringify(patch.platforms) : null,
    patch.channelIds !== undefined ? JSON.stringify(patch.channelIds) : null,
    patch.frequencyMinutes !== undefined ? Math.max(30, Number(patch.frequencyMinutes)) : null,
    patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : null,
    patch.clearError ? null : rule.last_error,
    ruleId,
    userId
  );
  return mapRule(db.prepare('SELECT * FROM discovery_rules WHERE id = ?').get(ruleId));
}

function deleteRule(userId, ruleId) {
  const rule = db.prepare('SELECT * FROM discovery_rules WHERE id = ? AND owner_id = ?').get(ruleId, userId);
  if (!rule) throw Object.assign(new Error('Rule not found'), { status: 404 });
  db.prepare('DELETE FROM discovery_rules WHERE id = ? AND owner_id = ?').run(ruleId, userId);
}

function newMatches(userId, collectionId) {
  const col = ownedCollection(userId, collectionId);
  if (!col) throw Object.assign(new Error('Collection not found'), { status: 404 });
  const rows = db
    .prepare(
      `SELECT rm.id AS matchId, rm.created_at, dr.id AS ruleId, dr.name AS ruleName, v.* FROM rule_matches rm
       JOIN discovery_rules dr ON dr.id = rm.rule_id
       JOIN videos v ON v.id = rm.video_id
       WHERE dr.collection_id = ? AND rm.dismissed = 0
       ORDER BY rm.created_at DESC LIMIT 100`
    )
    .all(collectionId);
  return rows.map((r) => ({
    matchId: r.matchId,
    ruleId: r.ruleId,
    ruleName: r.ruleName,
    createdAt: r.created_at,
    video: {
      id: r.id,
      platform: r.platform,
      platformVideoId: r.platform_video_id,
      creatorName: r.creator_name,
      title: r.title,
      thumbnailUrl: r.thumbnail_url,
      sourceUrl: r.source_url,
      publishedAt: r.published_at,
      duration: r.duration,
      isLive: Boolean(r.is_live),
    },
  }));
}

function acceptMatch(userId, collectionId, matchId, { alsoSave = true } = {}) {
  const col = ownedCollection(userId, collectionId);
  if (!col) throw Object.assign(new Error('Collection not found'), { status: 404 });
  const m = db
    .prepare(
      `SELECT rm.* FROM rule_matches rm
       JOIN discovery_rules dr ON dr.id = rm.rule_id
       WHERE rm.id = ? AND dr.collection_id = ? AND dr.owner_id = ?`
    )
    .get(matchId, collectionId, userId);
  if (!m) throw Object.assign(new Error('Match not found'), { status: 404 });
  if (alsoSave) {
    try {
      addVideoToCollection(userId, collectionId, m.video_id, 'auto-rule');
    } catch (e) {
      if (e.status !== 409) throw e;
    }
  }
  db.prepare('UPDATE rule_matches SET dismissed = 1 WHERE id = ?').run(matchId);
}

function dismissMatch(userId, collectionId, matchId) {
  const m = db
    .prepare(
      `SELECT rm.id FROM rule_matches rm
       JOIN discovery_rules dr ON dr.id = rm.rule_id
       WHERE rm.id = ? AND dr.collection_id = ? AND dr.owner_id = ?`
    )
    .get(matchId, collectionId, userId);
  if (!m) throw Object.assign(new Error('Match not found'), { status: 404 });
  db.prepare('UPDATE rule_matches SET dismissed = 1 WHERE id = ?').run(matchId);
}

function rulesDue(now = Date.now()) {
  return db
    .prepare(
      `SELECT dr.*, u.email AS owner_email FROM discovery_rules dr
       JOIN users u ON u.id = dr.owner_id
       WHERE dr.enabled = 1
         AND (dr.last_run_at IS NULL OR dr.last_run_at + dr.frequency_minutes * 60000 <= ?)`
    )
    .all(now);
}

function touchRule(ruleId, error = null) {
  db.prepare('UPDATE discovery_rules SET last_run_at = ?, last_error = ? WHERE id = ?').run(Date.now(), error, ruleId);
}

function recordMatch(ruleId, videoDbId) {
  try {
    db.prepare('INSERT INTO rule_matches (id, rule_id, video_id, created_at) VALUES (?,?,?,?)').run(
      id('match'),
      ruleId,
      videoDbId,
      Date.now()
    );
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  getItems,
  addVideoToCollection,
  removeVideoFromCollection,
  createRule,
  listRules,
  updateRule,
  deleteRule,
  newMatches,
  acceptMatch,
  dismissMatch,
  rulesDue,
  touchRule,
  recordMatch,
  ownedCollection,
};
