import { describe, it, expect } from 'vitest';

const { normalizeVideo, parseIsoDuration, videoKey, dedupeByPlatformId } = await import('./normalize.cjs');

describe('normalizeVideo', () => {
  it('maps a youtube-style payload', () => {
    const v = normalizeVideo('youtube', {
      platformVideoId: 'abc123',
      creatorId: 'ch1',
      creatorName: 'Chan',
      title: 'Hello',
      publishedAt: '2026-01-01T00:00:00Z',
      duration: 'PT1H2M3S',
      viewCount: 1234,
      isLive: false,
    });
    expect(v.platform).toBe('youtube');
    expect(v.platformVideoId).toBe('abc123');
    expect(v.duration).toBe(3723000);
    expect(v.isLive).toBe(0);
    expect(v.publishedAt).toBe(Date.parse('2026-01-01T00:00:00Z'));
  });

  it('returns null without platformVideoId', () => {
    expect(normalizeVideo('youtube', { title: 'x' })).toBeNull();
  });

  it('never fabricates missing fields', () => {
    const v = normalizeVideo('instagram', { platformVideoId: 'ig1' });
    expect(v.title).toBeNull();
    expect(v.thumbnailUrl).toBeNull();
    expect(v.sourceUrl).toBeNull();
    expect(v.duration).toBeNull();
  });

  it('the platform+id pair is the unique identity', () => {
    expect(videoKey('youtube', 'v1')).not.toBe(videoKey('instagram', 'v1'));
    expect(videoKey('youtube', 'v1')).toBe(videoKey('youtube', 'v1'));
  });
});

describe('parseIsoDuration', () => {
  it('parses hours', () => {
    expect(parseIsoDuration('PT2H')).toBe(7200000);
  });
  it('parses minutes and seconds', () => {
    expect(parseIsoDuration('PT4M15S')).toBe(255000);
  });
  it('returns null for junk', () => {
    expect(parseIsoDuration('nope')).toBeNull();
    expect(parseIsoDuration(null)).toBeNull();
  });
});

describe('dedupeByPlatformId', () => {
  it('keeps first occurrence per platform+id', () => {
    const items = [
      normalizeVideo('youtube', { platformVideoId: 'a', title: 'first' }),
      normalizeVideo('youtube', { platformVideoId: 'a', title: 'dup' }),
      normalizeVideo('instagram', { platformVideoId: 'a', title: 'other platform same id' }),
    ];
    const out = dedupeByPlatformId(items);
    expect(out).toHaveLength(2);
    expect(out.find((v) => v.platform === 'youtube').title).toBe('first');
    expect(out.find((v) => v.platform === 'instagram')).toBeTruthy();
  });

  it('drops null entries', () => {
    expect(dedupeByPlatformId([null, normalizeVideo('youtube', { platformVideoId: 'x' })])).toHaveLength(1);
  });
});
