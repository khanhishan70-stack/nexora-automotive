import { describe, it, expect } from 'vitest';

const { createQuotaManager, backoffDelayMs, isRetryableError } = await import('./quota.cjs');

describe('quota manager', () => {
  it('tracks spend against budget', () => {
    const q = createQuotaManager({ youtube: 300 });
    expect(q.canSpend('youtube', 'search.list')).toBe(true);
    q.spend('youtube', 'search.list');
    expect(q.remaining('youtube')).toBe(200);
  });

  it('blocks when budget would be exceeded', () => {
    const q = createQuotaManager({ youtube: 150 });
    q.spend('youtube', 'search.list');
    expect(q.canSpend('youtube', 'search.list')).toBe(false);
  });

  it('search costs 100, videos.list costs 1', () => {
    const q = createQuotaManager({ youtube: 10000 });
    expect(q.cost('youtube', 'search.list')).toBe(100);
    expect(q.cost('youtube', 'videos.list')).toBe(1);
  });

  it('snapshot reports usage', () => {
    const q = createQuotaManager({ youtube: 10000 });
    q.spend('youtube', 'search.list');
    const snap = q.snapshot('youtube');
    expect(snap.used).toBe(100);
    expect(snap.remaining).toBe(9900);
  });

  it('instagram has separate budget', () => {
    const q = createQuotaManager({ youtube: 100, instagram: 5 });
    q.spend('youtube', 'search.list');
    expect(q.remaining('instagram')).toBe(5);
  });
});

describe('backoffDelayMs', () => {
  it('grows exponentially', () => {
    const a = backoffDelayMs(0, 1000, 60000);
    const b = backoffDelayMs(3, 1000, 60000);
    expect(b).toBeGreaterThan(a);
  });

  it('caps at max', () => {
    for (let i = 0; i < 20; i++) {
      expect(backoffDelayMs(i, 1000, 5000)).toBeLessThanOrEqual(5000 * 1.13);
    }
  });

  it('is non-negative', () => {
    expect(backoffDelayMs(0)).toBeGreaterThanOrEqual(0);
  });
});

describe('isRetryableError', () => {
  it('retries on 429', () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
  });
  it('retries on 5xx', () => {
    expect(isRetryableError({ status: 503 })).toBe(true);
  });
  it('retries on network codes', () => {
    expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
  });
  it('does not retry 400', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
  });
  it('does not retry 403 (revoked token)', () => {
    expect(isRetryableError({ status: 403 })).toBe(false);
  });
});
