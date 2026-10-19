function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function interestProfile(interactions, videosById) {
  const creatorHits = new Map();
  const tokenHits = new Map();
  const platformHits = new Map();
  const negative = new Set();

  for (const it of interactions) {
    const video = videosById.get(it.videoId);
    if (!video) continue;
    const weight =
      it.type === 'saved' ? 3 : it.type === 'opened' ? 2 : it.type === 'watched' ? 2 : it.type === 'not_interested' ? -4 : 0;
    if (weight === 0) continue;
    if (it.type === 'not_interested') {
      negative.add(video.id);
      if (video.creatorId) creatorHits.set(video.creatorId, (creatorHits.get(video.creatorId) || 0) - 2);
      continue;
    }
    if (video.creatorId) creatorHits.set(video.creatorId, (creatorHits.get(video.creatorId) || 0) + weight);
    platformHits.set(video.platform, (platformHits.get(video.platform) || 0) + weight);
    for (const tok of tokenize(`${video.title || ''} ${video.description || ''}`)) {
      tokenHits.set(tok, (tokenHits.get(tok) || 0) + weight);
    }
  }

  return { creatorHits, tokenHits, platformHits, negative };
}

function scoreVideo(video, profile, explicitInterests = [], now = Date.now()) {
  if (profile.negative.has(video.id)) return -Infinity;
  let score = 0;

  if (video.creatorId) score += (profile.creatorHits.get(video.creatorId) || 0) * 4;
  score += (profile.platformHits.get(video.platform) || 0) * 0.5;

  const toks = new Set(tokenize(`${video.title || ''} ${video.description || ''}`));
  for (const t of toks) score += (profile.tokenHits.get(t) || 0) * 1.2;

  for (const interest of explicitInterests) {
    const iToks = new Set(tokenize(interest));
    let overlap = 0;
    for (const t of toks) if (iToks.has(t)) overlap += 1;
    if (iToks.size > 0) score += (overlap / iToks.size) * 8;
  }

  if (video.publishedAt) {
    const ageDays = (now - video.publishedAt) / 86400000;
    if (ageDays <= 1) score += 6;
    else if (ageDays <= 7) score += 3;
    else if (ageDays <= 30) score += 1;
  }

  if (video.isLive) score += 4;
  if (video.viewCount) score += Math.min(4, Math.log10(video.viewCount + 1));

  return score;
}

function recommendFeed(videos, interactions, explicitInterests = [], limit = 40, now = Date.now()) {
  const byId = new Map();
  for (const it of interactions) byId.set(it.videoId, { id: it.videoId });
  for (const v of videos) byId.set(v.id, v);

  const profile = interestProfile(interactions, byId);
  return videos
    .map((v) => ({ video: v, score: scoreVideo(v, profile, explicitInterests, now) }))
    .filter((x) => Number.isFinite(x.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.video);
}

function topInterests(interactions, videosById, n = 8) {
  const profile = interestProfile(interactions, videosById);
  return [...profile.tokenHits.entries()]
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([term, weight]) => ({ term, weight }));
}

module.exports = { tokenize, interestProfile, scoreVideo, recommendFeed, topInterests };
