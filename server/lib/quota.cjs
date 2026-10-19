const QUOTA_BUDGETS = { youtube: 10000, instagram: 200 };

const QUOTA_COSTS = {
  youtube: {
    'channels.list': 1,
    'subscriptions.list': 1,
    'search.list': 100,
    'videos.list': 1,
    'liveBroadcasts.list': 1,
  },
  instagram: {
    'me': 1,
    'me/media': 1,
    'media': 1,
  },
};

function createQuotaManager(budgets = QUOTA_BUDGETS) {
  const used = {};
  const resetsAt = {};
  for (const p of Object.keys(budgets)) {
    used[p] = 0;
    resetsAt[p] = nextMidnightUtc();
  }

  function nextMidnightUtc() {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  }

  function rollIfNeeded(platform) {
    if (Date.now() >= (resetsAt[platform] || 0)) {
      used[platform] = 0;
      resetsAt[platform] = nextMidnightUtc();
    }
  }

  return {
    cost(platform, operation) {
      return QUOTA_COSTS[platform]?.[operation] ?? 1;
    },
    canSpend(platform, operation) {
      rollIfNeeded(platform);
      return used[platform] + this.cost(platform, operation) <= budgets[platform];
    },
    spend(platform, operation) {
      rollIfNeeded(platform);
      const c = this.cost(platform, operation);
      used[platform] += c;
      return used[platform];
    },
    remaining(platform) {
      rollIfNeeded(platform);
      return budgets[platform] - used[platform];
    },
    snapshot(platform) {
      rollIfNeeded(platform);
      return {
        platform,
        used: used[platform],
        budget: budgets[platform],
        remaining: budgets[platform] - used[platform],
        resetsAt: resetsAt[platform],
      };
    },
  };
}

function backoffDelayMs(attempt, baseMs = 30000, maxMs = 6 * 60 * 60 * 1000) {
  const exp = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt)));
  const jitter = exp * 0.25 * Math.random();
  return Math.floor(exp - exp * 0.125 + jitter);
}

function isRetryableError(err) {
  const status = err?.status ?? err?.response?.status;
  if (status === 429) return true;
  if (status >= 500) return true;
  if (err?.code === 'ECONNRESET' || err?.code === 'ETIMEDOUT' || err?.code === 'ENOTFOUND') return true;
  return false;
}

module.exports = { createQuotaManager, backoffDelayMs, isRetryableError, QUOTA_BUDGETS, QUOTA_COSTS };
