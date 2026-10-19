import { describe, it, expect } from 'vitest';

const { tokenize, scoreVideo, recommendFeed, topInterests } = await import('./recommend.cjs');

const now = Date.now();
const mk = (id, over = {}) => ({
  id,
  platform: 'youtube',
  platformVideoId: id,
  creatorId: 'c1',
  creatorName: 'Creator',
  title: 'Some video',
  description: '',
  publishedAt: now - 86400000,
  isLive: 0,
  viewCount: 1000,
  ...over,
});

describe('tokenize', () => {
  it('lowercases and strips punctuation', () => {
    expect(tokenize('Python AI, tutorials!')).toEqual(['python', 'tutorials']);
  });
  it('drops short tokens', () => {
    expect(tokenize('a is an AI')).toEqual([]);
  });
});

describe('scoreVideo', () => {
  it('prefers creators you interacted with', () => {
    const profile = { creatorHits: new Map([['c1', 3]]), tokenHits: new Map(), platformHits: new Map(), negative: new Set() };
    const a = scoreVideo(mk('a'), profile);
    const b = scoreVideo(mk('b', { creatorId: 'other' }), profile);
    expect(a).toBeGreaterThan(b);
  });

  it('recency boosts score', () => {
    const profile = { creatorHits: new Map(), tokenHits: new Map(), platformHits: new Map(), negative: new Set() };
    const fresh = scoreVideo(mk('a', { publishedAt: now - 3600000 }), profile, [], now);
    const old = scoreVideo(mk('b', { publishedAt: now - 400 * 86400000 }), profile, [], now);
    expect(fresh).toBeGreaterThan(old);
  });

  it('explicit interests match on title tokens', () => {
    const profile = { creatorHits: new Map(), tokenHits: new Map(), platformHits: new Map(), negative: new Set() };
    const match = scoreVideo(mk('a', { title: 'Machine learning basics' }), profile, ['machine learning'], now);
    const noMatch = scoreVideo(mk('b', { title: 'Cooking pasta' }), profile, ['machine learning'], now);
    expect(match).toBeGreaterThan(noMatch);
  });

  it('not_interested videos are excluded entirely', () => {
    const v = mk('bad');
    const profile = { creatorHits: new Map(), tokenHits: new Map(), platformHits: new Map(), negative: new Set(['bad']) };
    expect(scoreVideo(v, profile)).toBe(-Infinity);
  });

  it('live videos get a boost', () => {
    const profile = { creatorHits: new Map(), tokenHits: new Map(), platformHits: new Map(), negative: new Set() };
    const live = scoreVideo(mk('a', { isLive: 1 }), profile, [], now);
    const vod = scoreVideo(mk('b', { isLive: 0 }), profile, [], now);
    expect(live).toBeGreaterThan(vod);
  });
});

describe('recommendFeed', () => {
  it('ranks and limits', () => {
    const videos = [mk('a', { title: 'React tutorial' }), mk('b', { title: 'Gardening' }), mk('c')];
    const interactions = [{ videoId: 'a', type: 'saved' }];
    const out = recommendFeed(videos, interactions, [], 10, now);
    expect(out[0].id).toBe('a');
    expect(out).toHaveLength(3);
  });

  it('filters not_interested out of results', () => {
    const videos = [mk('a'), mk('b')];
    const interactions = [{ videoId: 'b', type: 'not_interested' }];
    const out = recommendFeed(videos, interactions, [], 10, now);
    expect(out.map((v) => v.id)).toEqual(['a']);
  });
});

describe('topInterests', () => {
  it('surfaces frequent tokens from saved videos', () => {
    const videos = [mk('a', { title: 'python python react' })];
    const interactions = [{ videoId: 'a', type: 'saved' }];
    const byId = new Map([['a', videos[0]]]);
    const top = topInterests(interactions, byId);
    expect(top[0].term).toBe('python');
  });
});
