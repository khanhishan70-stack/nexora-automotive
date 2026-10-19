let csrfToken = null;

export function setCsrf(token) {
  csrfToken = token;
}

export function getCsrf() {
  return csrfToken;
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body === 'object') {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  if (csrfToken && options.method && options.method !== 'GET') {
    headers['x-csrf-token'] = csrfToken;
  }
  const res = await fetch(path, { credentials: 'same-origin', ...options, headers });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  health: () => request('/api/health'),
  me: () => request('/api/auth/me'),
  register: (body) => request('/api/auth/register', { method: 'POST', body }),
  login: (body) => request('/api/auth/login', { method: 'POST', body }),
  logout: () => request('/api/auth/logout', { method: 'POST', body: {} }),
  savePreferences: (interests) => request('/api/users/preferences', { method: 'PUT', body: { interests } }),
  accounts: () => request('/api/accounts'),
  disconnect: (platform, accountId) => request(`/api/accounts/${platform}/${accountId}`, { method: 'DELETE' }),
  startOAuth: (platform) => `/api/oauth/${platform}/start`,
  signInWithGoogle: () => `/api/oauth/google/signin`,
  signInWithInstagram: () => `/api/oauth/instagram/signin`,
  feed: ({ category = 'latest', platform = 'all', limit = 40, offset = 0 } = {}) =>
    request(`/api/feed?category=${encodeURIComponent(category)}&platform=${encodeURIComponent(platform)}&limit=${limit}&offset=${offset}`),
  refreshFeed: (platform = 'all') => request('/api/feed/refresh', { method: 'POST', body: { platform } }),
  feedStatus: () => request('/api/feed/status'),
  search: (q, platform = 'all') =>
    request(`/api/search?q=${encodeURIComponent(q)}&platform=${encodeURIComponent(platform)}`),
  collections: () => request('/api/collections'),
  createCollection: (body) => request('/api/collections', { method: 'POST', body }),
  updateCollection: (id, body) => request(`/api/collections/${id}`, { method: 'PATCH', body }),
  deleteCollection: (id) => request(`/api/collections/${id}`, { method: 'DELETE' }),
  collectionItems: (id, { sort = 'newest', q = '' } = {}) =>
    request(`/api/collections/${id}/items?sort=${sort}&q=${encodeURIComponent(q)}`),
  addToCollection: (id, videoId) => request(`/api/collections/${id}/items`, { method: 'POST', body: { videoId } }),
  removeFromCollection: (id, videoId) => request(`/api/collections/${id}/items/${videoId}`, { method: 'DELETE' }),
  rules: (collectionId) => request(`/api/collections/${collectionId}/rules`),
  createRule: (collectionId, body) => request(`/api/collections/${collectionId}/rules`, { method: 'POST', body }),
  updateRule: (ruleId, body) => request(`/api/rules/${ruleId}`, { method: 'PATCH', body }),
  deleteRule: (ruleId) => request(`/api/rules/${ruleId}`, { method: 'DELETE' }),
  matches: (collectionId) => request(`/api/collections/${collectionId}/matches`),
  acceptMatch: (collectionId, matchId, alsoSave = true) =>
    request(`/api/collections/${collectionId}/matches/${matchId}/accept`, { method: 'POST', body: { alsoSave } }),
  dismissMatch: (collectionId, matchId) =>
    request(`/api/collections/${collectionId}/matches/${matchId}/dismiss`, { method: 'POST', body: {} }),
  logInteraction: (videoId, type, metadata) => request('/api/interactions', { method: 'POST', body: { videoId, type, metadata } }),
  recommendations: () => request('/api/recommendations'),
  wrapped: (period = 'year') => request(`/api/wrapped?period=${encodeURIComponent(period)}`),
  getProfile: (username) => request(`/api/profile/${encodeURIComponent(username)}`),
  updateProfile: (body) => request('/api/profile', { method: 'PUT', body }),
  getProfileVideos: (username) => request(`/api/profile/${encodeURIComponent(username)}/videos`),
};
