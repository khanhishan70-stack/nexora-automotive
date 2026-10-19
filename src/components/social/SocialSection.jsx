import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, setCsrf } from '../../lib/api.js';
import WrappedOverlay from '../WrappedOverlay.jsx';

const PLATFORM_LABEL = { youtube: 'YouTube', instagram: 'Instagram' };
const CATEGORIES = [
  { id: 'latest', label: 'Latest' },
  { id: 'trending', label: 'Trending' },
  { id: 'live', label: 'Live Now' },
  { id: 'following', label: 'Following' },
  { id: 'for-you', label: 'For You' },
  { id: 'recently-added', label: 'Recently Added' },
];

function fmtDur(ms) {
  if (!ms && ms !== 0) return null;
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

function fmtWhen(ts) {
  if (!ts) return 'unknown';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function VideoThumb({ video }) {
  const [failed, setFailed] = useState(false);
  if (!video.thumbnailUrl || failed) {
    return <div className="sv-thumb sv-thumb-fallback">{PLATFORM_LABEL[video.platform] || video.platform}</div>;
  }
  return (
    <img
      className="sv-thumb"
      src={video.thumbnailUrl}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function VideoCard({ video, onSave, onPlay, onNotInterested, dbId }) {
  const vid = dbId || video.dbId || video.id;
  return (
    <article className="sv-card">
      <button type="button" className="sv-card-media" onClick={() => onPlay(video)} aria-label={`Play ${video.title || 'video'}`}>
        <VideoThumb video={video} />
        <span className={`sv-badge sv-badge-${video.platform}`}>{PLATFORM_LABEL[video.platform] || video.platform}</span>
        {video.isLive && <span className="sv-badge sv-live">● LIVE</span>}
        {video.duration ? <span className="sv-dur">{fmtDur(video.duration)}</span> : null}
      </button>
      <div className="sv-card-body">
        <h4 className="sv-card-title">{video.title || 'Untitled'}</h4>
        <p className="sv-card-meta">
          {video.creatorName || 'Unknown creator'}
          {video.publishedAt ? ` · ${fmtWhen(video.publishedAt)}` : ''}
          {video.viewCount ? ` · ${video.viewCount.toLocaleString()} views` : ''}
        </p>
        <div className="sv-card-actions">
          <button type="button" className="sv-btn sv-btn-small" onClick={() => onSave(video, vid)}>
            Save
          </button>
          {/^https?:/.test(video.sourceUrl || '') && (
            <a className="sv-btn sv-btn-small sv-btn-ghost" href={video.sourceUrl} target="_blank" rel="noreferrer">
              Open ↗
            </a>
          )}
          {onNotInterested && (
            <button type="button" className="sv-btn sv-btn-small sv-btn-ghost" onClick={() => onNotInterested(video, vid)}>
              Not for me
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function SaveModal({ video, videoDbId, onClose, onDone }) {
  const [collectionsList, setCollectionsList] = useState([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.collections().then((d) => setCollectionsList(d.collections)).catch(() => {});
  }, []);

  const saveTo = async (collectionId) => {
    setBusy(true);
    setErr(null);
    try {
      await api.addToCollection(collectionId, videoDbId);
      await api.logInteraction(videoDbId, 'saved', { collectionId });
      onDone(`Saved to “${collectionsList.find((c) => c.id === collectionId)?.name}”`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const createAndSave = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const { collection } = await api.createCollection({ name: newName.trim() });
      await api.addToCollection(collection.id, videoDbId);
      await api.logInteraction(videoDbId, 'saved', { collectionId: collection.id });
      onDone(`Created “${collection.name}” and saved the video`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sv-modal" role="dialog" aria-modal="true" aria-label="Save to collection" onClick={onClose}>
      <div className="sv-modal-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Save to collection</h3>
        <p className="sv-modal-sub">{video.title || 'Untitled'}</p>
        {err && <p className="sv-error">{err}</p>}
        <div className="sv-save-list">
          {collectionsList.length === 0 && <p className="sv-empty-inline">No collections yet — create one below.</p>}
          {collectionsList.map((c) => (
            <button key={c.id} type="button" className="sv-save-row" disabled={busy} onClick={() => saveTo(c.id)}>
              <span>{c.name}</span>
              <span className="sv-save-count">{c.itemCount}</span>
            </button>
          ))}
        </div>
        <div className="sv-save-create">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New collection name…"
            aria-label="New collection name"
          />
          <button type="button" className="sv-btn" disabled={busy || !newName.trim()} onClick={createAndSave}>
            Create & save
          </button>
        </div>
        <button type="button" className="sv-modal-close" onClick={onClose}>
          Close (Esc)
        </button>
      </div>
    </div>
  );
}

function PlayerModal({ video, onClose }) {
  const mp4 = typeof video.sourceUrl === 'string' && /\.mp4(\?|#|$)/.test(video.sourceUrl);
  const isYt =
    !mp4 &&
    video.platform === 'youtube' &&
    video.platformVideoId &&
    !String(video.platformVideoId).startsWith('demo-');
  return (
    <div className="sv-modal sv-modal-wide" role="dialog" aria-modal="true" aria-label="Video player" onClick={onClose}>
      <div className="sv-modal-panel sv-player-panel" onClick={(e) => e.stopPropagation()}>
        {mp4 ? (
          <video
            className="sv-player"
            src={video.sourceUrl}
            poster={video.thumbnailUrl || undefined}
            controls
            autoPlay
            loop
            playsInline
          />
        ) : isYt ? (
          <iframe
            className="sv-player"
            src={`https://www.youtube-nocookie.com/embed/${video.platformVideoId}?autoplay=1`}
            title={video.title || 'YouTube player'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="sv-player sv-player-unsupported">
            <VideoThumb video={video} />
            <p>
              {video.sourceUrl ? (
                <>
                  Instagram does not permit embedded playback of this media here.{' '}
                  <a href={video.sourceUrl} target="_blank" rel="noreferrer">
                    Open on Instagram ↗
                  </a>
                </>
              ) : (
                'Embedded playback is not available for this item.'
              )}
            </p>
          </div>
        )}
        <div className="sv-player-side">
          <span className={`sv-platform-tag sv-platform-${video.platform}`}>{PLATFORM_LABEL[video.platform]}</span>
          <h3>{video.title || 'Untitled'}</h3>
          <p className="sv-modal-sub">{video.creatorName}</p>
          {video.description && <p className="sv-player-desc">{video.description.slice(0, 400)}</p>}
          <button type="button" className="sv-modal-close" onClick={onClose}>
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}

function ConnectPanel({ health, user, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  const disconnect = async (acc) => {
    setBusy(acc.id);
    try {
      await api.disconnect(acc.platform, acc.id);
      setMsg(`${PLATFORM_LABEL[acc.platform]} disconnected and token revoked`);
      onChanged();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(null);
    }
  };

  const googleConfigured = health?.configured?.google;
  const googleConnected = (health?.accounts || []).some(a => a.platform === 'google');

  return (
    <div className="sv-connect">
      <div className="sv-connect-card sv-connect-google">
        <div className="sv-connect-head">
          <span className="sv-platform-tag sv-platform-google">Google</span>
          {googleConfigured ? (
            <span className="sv-status sv-status-ok">API configured</span>
          ) : (
            <span className="sv-status sv-status-warn">Credentials required</span>
          )}
        </div>
        {!googleConfigured && (
          <p className="sv-hint">
            Add Google OAuth keys to <code>.env</code> (see <code>.env.example</code>), then restart the API.
          </p>
        )}
        {googleConfigured && !googleConnected && (
          <a className="sv-btn sv-btn-google" href={api.signInWithGoogle()}>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google & Auto-Connect YouTube + Instagram
          </a>
        )}
        {googleConfigured && googleConnected && (
          <p className="sv-hint">Google account connected. YouTube/Instagram accounts linked to this Google account are auto-connected.</p>
        )}
      </div>

      {['youtube', 'instagram'].map((p) => {
        const configured = health?.configured?.[p];
        const accounts = (health?.accounts || []).filter((a) => a.platform === p);
        const limitation = health?.limitations?.[p];
        return (
          <div className="sv-connect-card" key={p}>
            <div className="sv-connect-head">
              <span className={`sv-platform-tag sv-platform-${p}`}>{PLATFORM_LABEL[p]}</span>
              {configured ? (
                <span className="sv-status sv-status-ok">API configured</span>
              ) : (
                <span className="sv-status sv-status-warn">Credentials required</span>
              )}
            </div>
            {limitation && <p className="sv-limitation">{limitation}</p>}
            {!configured && (
              <p className="sv-hint">
                Add {PLATFORM_LABEL[p]} keys to <code>.env</code> on the server (see <code>.env.example</code>), then
                restart the API. The connection flow uses the official OAuth dialog.
              </p>
            )}
            {accounts.length === 0 ? (
              <a
                className={`sv-btn${configured ? '' : ' sv-btn-disabled'}`}
                href={configured ? api.startOAuth(p) : undefined}
                onClick={(e) => {
                  if (!configured) e.preventDefault();
                }}
              >
                Connect {PLATFORM_LABEL[p]}
              </a>
            ) : (
              <ul className="sv-acc-list">
                {accounts.map((acc) => (
                  <li key={acc.id}>
                    <div>
                      <p className="sv-acc-label">{acc.label || acc.platformAccountId}</p>
                      <p className="sv-acc-meta">
                        {acc.lastError ? (
                          <span className="sv-status sv-status-err">{acc.lastError}</span>
                        ) : (
                          <>Last sync: {acc.lastSyncAt ? fmtWhen(acc.lastSyncAt) : 'never'}</>
                        )}
                        {acc.tokenExpiringSoon && <span className="sv-status sv-status-warn"> · token expiring soon</span>}
                      </p>
                    </div>
                    <button type="button" className="sv-btn sv-btn-small sv-btn-ghost" disabled={busy === acc.id} onClick={() => disconnect(acc)}>
                      Disconnect
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {msg && <p className="sv-flash">{msg}</p>}
      <p className="sv-hint">Signed in as {user?.email}. Disconnecting revokes stored tokens where the platform supports it.</p>
    </div>
  );
}

function FeedPanel({ user, onPlay, onSave, refreshSignal }) {
  const [category, setCategory] = useState('latest');
  const [platform, setPlatform] = useState('all');
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const d = await api.feed({ category, platform });
      setFeed(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [category, platform]);

  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshFeed(platform);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const notInterested = async (video, vid) => {
    try {
      await api.logInteraction(vid, 'not_interested');
      setFeed((f) => ({ ...f, items: f.items.filter((v) => v.id !== vid) }));
    } catch {}
  };

  const lastOk = feed?.syncStatus?.filter((s) => s.lastSuccessAt).sort((a, b) => b.lastSuccessAt - a.lastSuccessAt)[0];

  return (
    <div className="sv-feed">
      <div className="sv-controls">
        <div className="sv-chips" role="tablist" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={category === c.id}
              className={`sv-chip${category === c.id ? ' is-active' : ''}`}
              onClick={() => setCategory(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="sv-controls-right">
          <div className="sv-chips sv-chips- platform">
            {['all', 'youtube', 'instagram'].map((p) => (
              <button
                key={p}
                type="button"
                className={`sv-chip${platform === p ? ' is-active' : ''}`}
                onClick={() => setPlatform(p)}
              >
                {p === 'all' ? 'All Platforms' : PLATFORM_LABEL[p]}
              </button>
            ))}
          </div>
          <button type="button" className="sv-btn sv-btn-small" onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Syncing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {lastOk && (
        <p className="sv-updated">
          Last successful sync: {fmtWhen(lastOk.lastSuccessAt)} ({lastOk.platform})
          {feed?.syncStatus?.some((s) => s.status === 'error') && (
            <span className="sv-status sv-status-warn"> · some sources failing — showing last good data</span>
          )}
        </p>
      )}

      {err && <p className="sv-error">{err}</p>}

      {loading ? (
        <p className="sv-empty">Loading feed…</p>
      ) : !feed || feed.items.length === 0 ? (
        <div className="sv-empty-state">
          <p>No videos here yet.</p>
          <p className="sv-hint">
            {platform === 'instagram'
              ? 'Instagram discovery is limited to your connected professional account media (API limitation).'
              : 'Connect an account on the Connect tab and hit Refresh — real videos from your subscriptions and saved collections will appear here. Nothing on this page is simulated.'}
          </p>
        </div>
      ) : (
        <div className="sv-grid">
          {feed.items.map((v) => (
            <VideoCard key={`${v.platform}:${v.platformVideoId}`} video={v} onSave={onSave} onPlay={onPlay} onNotInterested={notInterested} />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchPanel({ onPlay, onSave }) {
  const [q, setQ] = useState('');
  const [platform, setPlatform] = useState('all');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkCollection, setBulkCollection] = useState('');
  const [collectionsList, setCollectionsList] = useState([]);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    api.collections().then((d) => setCollectionsList(d.collections)).catch(() => {});
  }, []);

  const runSearch = async (e) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setSelected(new Set());
    try {
      const d = await api.search(q.trim(), platform);
      setResult(d);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const bulkSave = async () => {
    if (!bulkCollection || selected.size === 0) return;
    let ok = 0;
    for (const v of result.videos) {
      const key = `${v.platform}:${v.platformVideoId}`;
      if (!selected.has(key)) continue;
      try {
        await api.addToCollection(bulkCollection, v.dbId || v.id);
        await api.logInteraction(v.dbId || v.id, 'saved', { collectionId: bulkCollection, via: 'search' });
        ok++;
      } catch {}
    }
    setFlash(`Saved ${ok} video(s) to collection`);
    setSelected(new Set());
  };

  return (
    <div className="sv-search">
      <form className="sv-search-bar" onSubmit={runSearch}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Search YouTube — try "Python AI tutorials"'
          aria-label="Search videos"
        />
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
          <option value="all">All platforms</option>
          <option value="youtube">YouTube</option>
          <option value="instagram">Instagram (connected media only)</option>
        </select>
        <button type="submit" className="sv-btn" disabled={loading || !q.trim()}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {result?.limitations?.length > 0 && (
        <div className="sv-limitations">
          {result.limitations.map((l, i) => (
            <p key={i} className="sv-limitation">
              <strong>{PLATFORM_LABEL[l.platform] || l.platform}:</strong> {l.message}
            </p>
          ))}
        </div>
      )}

      {flash && <p className="sv-flash">{flash}</p>}

      {selected.size > 0 && (
        <div className="sv-bulk-bar">
          <span>{selected.size} selected</span>
          <select value={bulkCollection} onChange={(e) => setBulkCollection(e.target.value)} aria-label="Collection">
            <option value="">Choose collection…</option>
            {collectionsList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" className="sv-btn sv-btn-small" disabled={!bulkCollection} onClick={bulkSave}>
            Save selected
          </button>
        </div>
      )}

      {result && result.videos.length === 0 && (
        <p className="sv-empty">No matching videos from the sources available to this app.</p>
      )}

      {result && result.videos.length > 0 && (
        <div className="sv-grid sv-grid-search">
          {result.videos.map((v) => {
            const key = `${v.platform}:${v.platformVideoId}`;
            return (
              <div key={key} className={`sv-selectable${selected.has(key) ? ' is-selected' : ''}`}>
                <label className="sv-check">
                  <input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} aria-label={`Select ${v.title}`} />
                </label>
                <VideoCard video={v} dbId={v.dbId || v.id} onSave={onSave} onPlay={onPlay} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CollectionsPanel({ onPlay }) {
  const [collectionsList, setCollectionsList] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [items, setItems] = useState(null);
  const [sort, setSort] = useState('newest');
  const [q, setQ] = useState('');
  const [rules, setRules] = useState([]);
  const [matches, setMatches] = useState([]);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [flash, setFlash] = useState(null);
  const [err, setErr] = useState(null);

  const reloadList = useCallback(async () => {
    const d = await api.collections();
    setCollectionsList(d.collections);
    return d.collections;
  }, []);

  useEffect(() => {
    reloadList();
  }, [reloadList]);

  const openCollection = useCallback(async (id) => {
    setActiveId(id);
    setErr(null);
    try {
      const [it, rl, mt] = await Promise.all([
        api.collectionItems(id, { sort, q }),
        api.rules(id),
        api.matches(id),
      ]);
      setItems(it.items);
      setRules(rl.rules);
      setMatches(mt.matches);
    } catch (e) {
      setErr(e.message);
    }
  }, [sort, q]);

  useEffect(() => {
    if (activeId) openCollection(activeId);
  }, [activeId, openCollection]);

  const create = async () => {
    if (!newName.trim()) return;
    try {
      const { collection } = await api.createCollection({ name: newName.trim(), description: newDesc.trim() || undefined });
      setNewName('');
      setNewDesc('');
      await reloadList();
      setActiveId(collection.id);
      setFlash(`Created “${collection.name}”`);
    } catch (e) {
      setErr(e.message);
    }
  };

  const rename = async () => {
    const name = window.prompt('Rename collection', active?.name);
    if (!name) return;
    await api.updateCollection(activeId, { name });
    await reloadList();
  };

  const remove = async () => {
    if (!window.confirm(`Delete “${active?.name}” and its ${active?.itemCount} saved videos?`)) return;
    await api.deleteCollection(activeId);
    setActiveId(null);
    setItems(null);
    await reloadList();
  };

  const togglePrivate = async () => {
    await api.updateCollection(activeId, { isPrivate: !active.isPrivate });
    await reloadList();
    await openCollection(activeId);
  };

  const removeItem = async (videoId) => {
    await api.removeFromCollection(activeId, videoId);
    await openCollection(activeId);
    await reloadList();
  };

  const addRule = async () => {
    const termsRaw = window.prompt('Discovery search terms (comma-separated):\ne.g. AI news, machine learning');
    if (!termsRaw) return;
    const searchTerms = termsRaw.split(',').map((s) => s.trim()).filter(Boolean);
    await api.createRule(activeId, { searchTerms, platforms: ['youtube'], frequencyMinutes: 360 });
    await openCollection(activeId);
  };

  const toggleRule = async (rule) => {
    await api.updateRule(rule.id, { enabled: !rule.enabled, clearError: true });
    await openCollection(activeId);
  };

  const runRuleNow = async (rule) => {
    await api.updateRule(rule.id, { frequencyMinutes: rule.frequencyMinutes, clearError: true });
    const terms = rule.searchTerms.slice(0, 3);
    for (const term of terms) {
      try {
        const d = await api.search(term, 'youtube');
        for (const v of d.videos.slice(0, 10)) {
          // matches are recorded server-side during sync; search here warms the video table
          void v;
        }
      } catch {}
    }
    setFlash('Rule queued — run Refresh on the server sync cycle or check matches after the next worker tick');
    await openCollection(activeId);
  };

  const active = collectionsList.find((c) => c.id === activeId) || null;

  return (
    <div className="sv-collections">
      <div className="sv-col-layout">
        <aside className="sv-col-list">
          <div className="sv-col-create">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New collection…" aria-label="New collection name" />
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description (optional)" aria-label="Description" />
            <button type="button" className="sv-btn" onClick={create} disabled={!newName.trim()}>
              Create collection
            </button>
          </div>
          {collectionsList.length === 0 && (
            <p className="sv-empty-inline">Collections persist in the server database — they survive reloads and new devices.</p>
          )}
          {collectionsList.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`sv-col-item${activeId === c.id ? ' is-active' : ''}`}
              onClick={() => setActiveId(c.id)}
            >
              <span className="sv-col-name">
                {c.name}
                {c.isPrivate ? ' 🔒' : ''}
              </span>
              <span className="sv-col-meta">
                {c.itemCount} videos{c.pendingMatches > 0 ? ` · ${c.pendingMatches} new matches` : ''}
              </span>
            </button>
          ))}
        </aside>

        <div className="sv-col-detail">
          {!active ? (
            <p className="sv-empty">Select or create a collection.</p>
          ) : (
            <>
              <div className="sv-col-head">
                <div>
                  <h3>{active.name}</h3>
                  {active.description && <p className="sv-modal-sub">{active.description}</p>}
                </div>
                <div className="sv-col-tools">
                  <button type="button" className="sv-btn sv-btn-small sv-btn-ghost" onClick={rename}>
                    Rename
                  </button>
                  <button type="button" className="sv-btn sv-btn-small sv-btn-ghost" onClick={togglePrivate}>
                    {active.isPrivate ? 'Make shared' : 'Make private'}
                  </button>
                  <button type="button" className="sv-btn sv-btn-small sv-btn-ghost" onClick={remove}>
                    Delete
                  </button>
                </div>
              </div>

              {err && <p className="sv-error">{err}</p>}
              {flash && <p className="sv-flash">{flash}</p>}

              <div className="sv-col-filters">
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search within collection…" aria-label="Search within collection" />
                <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="recently-saved">Recently saved</option>
                </select>
              </div>

              <section className="sv-rules">
                <div className="sv-rules-head">
                  <h4>Automatic discovery</h4>
                  <button type="button" className="sv-btn sv-btn-small" onClick={addRule}>
                    + Add rule
                  </button>
                </div>
                <p className="sv-hint">
                  Rules search supported APIs on a schedule and surface matches below. New matches are never auto-added —
                  you approve each one. Manual saves are always separate.
                </p>
                {rules.length === 0 && <p className="sv-empty-inline">No discovery rules on this collection.</p>}
                {rules.map((r) => (
                  <div className="sv-rule" key={r.id}>
                    <div>
                      <p className="sv-rule-name">
                        {r.name} {r.enabled ? '' : '(paused)'}
                      </p>
                      <p className="sv-rule-terms">{r.searchTerms.join(' · ')}</p>
                      <p className="sv-acc-meta">
                        every {r.frequencyMinutes}m{r.lastRunAt ? ` · last run ${fmtWhen(r.lastRunAt)}` : ' · never run'}
                        {r.lastError ? <span className="sv-status sv-status-err"> · {r.lastError}</span> : null}
                      </p>
                    </div>
                    <div className="sv-rule-tools">
                      <button type="button" className="sv-btn sv-btn-small sv-btn-ghost" onClick={() => toggleRule(r)}>
                        {r.enabled ? 'Pause' : 'Resume'}
                      </button>
                      <button type="button" className="sv-btn sv-btn-small sv-btn-ghost" onClick={() => runRuleNow(r)}>
                        Run now*
                      </button>
                      <button
                        type="button"
                        className="sv-btn sv-btn-small sv-btn-ghost"
                        onClick={async () => {
                          await api.deleteRule(r.id);
                          await openCollection(activeId);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {rules.length > 0 && <p className="sv-hint">* “Run now” searches immediately within API quota; scheduled runs happen on the server worker.</p>}
              </section>

              {matches.length > 0 && (
                <section className="sv-matches">
                  <h4>New matches</h4>
                  {matches.map((m) => (
                    <div className="sv-match" key={m.matchId}>
                      <VideoThumb video={m.video} />
                      <div>
                        <p className="sv-rule-name">{m.video.title}</p>
                        <p className="sv-acc-meta">
                          from rule “{m.ruleName}” · {fmtWhen(m.createdAt)}
                        </p>
                      </div>
                      <div className="sv-rule-tools">
                        <button
                          type="button"
                          className="sv-btn sv-btn-small"
                          onClick={async () => {
                            await api.acceptMatch(activeId, m.matchId, true);
                            await openCollection(activeId);
                            await reloadList();
                          }}
                        >
                          Add to collection
                        </button>
                        <button
                          type="button"
                          className="sv-btn sv-btn-small sv-btn-ghost"
                          onClick={async () => {
                            await api.dismissMatch(activeId, m.matchId);
                            await openCollection(activeId);
                          }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              <section className="sv-col-items">
                <h4>Saved videos ({active.itemCount})</h4>
                {items === null ? (
                  <p className="sv-empty">Loading…</p>
                ) : items.length === 0 ? (
                  <p className="sv-empty-inline">Nothing saved yet — use Save on any feed or search result.</p>
                ) : (
                  <ul className="sv-item-list">
                    {items.map(({ video, savedAt, origin }) => (
                      <li key={video.id}>
                        <button type="button" className="sv-item-media" onClick={() => onPlay(video)} aria-label={`Play ${video.title}`}>
                          <VideoThumb video={video} />
                        </button>
                        <div className="sv-item-info">
                          <p className="sv-rule-name">{video.title}</p>
                          <p className="sv-acc-meta">
                            {PLATFORM_LABEL[video.platform]} · {video.creatorName} · saved {fmtWhen(savedAt)}
                            {origin === 'auto-rule' ? ' · auto-rule' : ''}
                          </p>
                        </div>
                        <button type="button" className="sv-btn sv-btn-small sv-btn-ghost" onClick={() => removeItem(video.id)}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HeroPanel() {
  const social = window.__REELRING_SOCIAL__;
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(null);

  const toggleSocialFeed = () => {
    if (social) {
      social.setUseSocialFeed(!social.useSocialFeed);
    }
  };

  const refreshHero = async () => {
    if (!social) return;
    setLoading(true);
    try {
      await social.fetchSocialFeed();
      setFlash('Hero feed refreshed with latest videos');
    } catch (e) {
      setFlash('Failed to refresh: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCollection = (id) => {
    if (!social) return;
    const next = social.selectedCollections.includes(id)
      ? social.selectedCollections.filter((c) => c !== id)
      : [...social.selectedCollections, id];
    social.setSelectedCollections(next);
  };

  const toggleCategory = (id) => {
    if (!social) return;
    const next = social.selectedCategories.includes(id)
      ? social.selectedCategories.filter((c) => c !== id)
      : [...social.selectedCategories, id];
    social.setSelectedCategories(next);
  };

  const collections = social?.selectedCollections || [];
  const categories = social?.selectedCategories || [];

  const HERO_CATEGORIES = [
    { id: 'latest', label: 'Latest' },
    { id: 'trending', label: 'Trending' },
    { id: 'live', label: 'Live Now' },
    { id: 'following', label: 'Following' },
    { id: 'for-you', label: 'For You' },
    { id: 'recently-added', label: 'Recently Added' },
  ];

  return (
    <div className="sv-hero-panel">
      <div className="sv-hero-toggle">
        <div>
          <h3>Use Social Feed in Hero Carousel</h3>
          <p className="sv-hint">
            Replace the demo reels with your connected YouTube & Instagram videos in the 3D spinning wall.
          </p>
        </div>
        <button
          type="button"
          className={`sv-btn sv-toggle${social?.useSocialFeed ? ' is-on' : ''}`}
          onClick={toggleSocialFeed}
          aria-pressed={social?.useSocialFeed}
        >
          <span className="sv-toggle-thumb" />
        </button>
      </div>

      {social?.useSocialFeed && (
        <>
          <div className="sv-hero-section">
            <h4>Collections to Show in Hero</h4>
            <p className="sv-hint">Select collections whose videos will populate the 3D wall. Empty = all videos.</p>
            <div className="sv-chips sv-chips-multi">
              {collections.map((id) => (
                <span key={id} className="sv-chip is-active">
                  {id} <button type="button" onClick={() => toggleCollection(id)} aria-label={`Remove ${id}`}>×</button>
                </span>
              ))}
              <button type="button" className="sv-chip sv-chip-add" onClick={() => {
                const name = window.prompt('Collection ID to add:');
                if (name) toggleCollection(name);
              }}>
                + Add Collection
              </button>
            </div>
          </div>

          <div className="sv-hero-section">
            <h4>Categories to Include</h4>
            <p className="sv-hint">Filter which feed categories appear in the hero.</p>
            <div className="sv-chips sv-chips-multi">
              {HERO_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`sv-chip${categories.includes(c.id) ? ' is-active' : ''}`}
                  onClick={() => toggleCategory(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="sv-hero-actions">
            <button type="button" className="sv-btn" onClick={refreshHero} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh Hero Feed Now'}
            </button>
            {flash && <p className="sv-flash">{flash}</p>}
          </div>
        </>
      )}
    </div>
  );
}

function ProfilePanel({ user, onProfileSaved }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ username: '', bio: '', accentColor: '#ff2d55', avatarUrl: '', isPublic: false });

  useEffect(() => {
    api
      .me()
      .then((d) => {
        if (d.profile) {
          setProfile(d.profile);
          setForm({
            username: d.profile.username || '',
            bio: d.profile.bio || '',
            accentColor: d.profile.accentColor || '#ff2d55',
            avatarUrl: d.profile.avatarUrl || '',
            isPublic: d.profile.isPublic,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const shareUrl = profile?.username ? `${window.location.origin}/u/${profile.username}` : '';
  const embedCode = profile?.username
    ? `<iframe src="${shareUrl}" width="100%" height="640" frameborder="0" allow="autoplay; fullscreen" title="${user.displayName} on REELRING"></iframe>`
    : '';

  const save = async () => {
    setBusy(true);
    setFlash(null);
    try {
      const d = await api.updateProfile({
        username: form.username,
        bio: form.bio,
        accentColor: form.accentColor,
        avatarUrl: form.avatarUrl,
        isPublic: form.isPublic,
      });
      setProfile(d.profile);
      setFlash('Profile saved!');
      onProfileSaved?.(d.profile);
    } catch (e) {
      setFlash(e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = (text) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <p className="sv-empty">Loading profile…</p>;

  return (
    <div className="sv-profile-panel">
      <div className="sv-profile-card">
        <div className="sv-profile-preview">
          <div className="sv-profile-avatar" style={{ background: form.accentColor }}>
            {form.avatarUrl ? <img src={form.avatarUrl} alt="" /> : <span>{(user.displayName || '?').charAt(0).toUpperCase()}</span>}
          </div>
          <div>
            <h3>{user.displayName}</h3>
            <span className="sv-profile-handle">@{form.username || 'set-username'}</span>
          </div>
        </div>

        <div className="sv-field">
          <label htmlFor="pp-username">Username (public URL)</label>
          <div className="sv-url-preview">
            <span>{window.location.origin}/u/</span>
            <input
              id="pp-username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="your-name"
              maxLength={30}
            />
          </div>
          <p className="sv-hint">Letters, numbers, dashes. Minimum 3 characters.</p>
        </div>

        <div className="sv-field">
          <label htmlFor="pp-bio">Bio</label>
          <textarea
            id="pp-bio"
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            placeholder="Creator. Storyteller. Reels that hit different."
            maxLength={300}
            rows={3}
          />
        </div>

        <div className="sv-field-row">
          <div className="sv-field">
            <label htmlFor="pp-color">Accent color</label>
            <div className="sv-color-row">
              <input
                id="pp-color"
                type="color"
                value={form.accentColor}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
              />
              <code>{form.accentColor}</code>
            </div>
          </div>
          <div className="sv-field">
            <label htmlFor="pp-avatar">Avatar URL</label>
            <input
              id="pp-avatar"
              value={form.avatarUrl}
              onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="sv-profile-public">
          <div>
            <h4>Public portfolio</h4>
            <p className="sv-hint">
              {form.isPublic ? 'Anyone with your link can view your 3D reel carousel.' : 'Only you can see your portfolio. Turn it on to share.'}
            </p>
          </div>
          <button
            type="button"
            className={`sv-btn sv-toggle${form.isPublic ? ' is-on' : ''}`}
            onClick={() => setForm({ ...form, isPublic: !form.isPublic })}
            aria-pressed={form.isPublic}
            aria-label="Toggle public portfolio"
          >
            <span className="sv-toggle-thumb" />
          </button>
        </div>

        <button type="button" className="sv-btn sv-btn-primary" onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
        {flash && <p className="sv-flash">{flash}</p>}
      </div>

      <div className="sv-share-card">
        <h3>Share your portfolio</h3>
        <p className="sv-hint">Give this link to fans — it opens your 3D reel wall. No login needed to view.</p>

        <div className="sv-share-row">
          <input readOnly value={shareUrl} aria-label="Your portfolio link" />
          <button type="button" className="sv-btn" onClick={() => copy(shareUrl)}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>

        {!form.isPublic && <p className="sv-warn">⚠ Your portfolio is private — visitors will see 404. Turn it on above.</p>}

        <div className="sv-share-row">
          <input readOnly value={embedCode} aria-label="Embed code" />
          <button type="button" className="sv-btn" onClick={() => copy(embedCode)}>
            Copy embed
          </button>
        </div>
        <p className="sv-hint">Paste the embed into your site, blog, or Linktree-style page.</p>
      </div>
    </div>
  );
}

function AuthPanel({ onAuthed }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const d =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.register({ email, password, displayName });
      setCsrf(d.csrfToken);
      onAuthed(d.user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="sv-auth" onSubmit={submit}>
      <h3>{mode === 'login' ? 'Sign in' : 'Create account'}</h3>
      <p className="sv-hint">
        One account for collections, sync and recommendations. Passwords are scrypt-hashed server-side; social tokens are
        encrypted at rest and never sent to the browser.
      </p>
      {err && <p className="sv-error">{err}</p>}
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required aria-label="Email" />
      {mode === 'register' && (
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" aria-label="Display name" />
      )}
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password (8+ chars)"
        required
        minLength={8}
        aria-label="Password"
      />
      <button type="submit" className="sv-btn" disabled={busy}>
        {busy ? '…' : mode === 'login' ? 'Sign in' : 'Register'}
      </button>

      <div className="sv-auth-divider" aria-hidden="true">
        <span>or continue with</span>
      </div>

      <a className="sv-btn sv-btn-instagram" href={api.signInWithInstagram()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="2" y="2" width="20" height="20" rx="6" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
          <circle cx="17.5" cy="6.5" r="1.5" fill="currentColor" />
        </svg>
        Sign in with Instagram
      </a>

      <button type="button" className="sv-modal-close" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
      </button>
    </form>
  );
}

export default function SocialSection() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [health, setHealth] = useState(null);
  const [tab, setTab] = useState('feed');
  const [saveTarget, setSaveTarget] = useState(null);
  const [playTarget, setPlayTarget] = useState(null);
  const [flash, setFlash] = useState(null);
  const [feedSignal, setFeedSignal] = useState(0);
  const [showWrapped, setShowWrapped] = useState(false);
  const [interests, setInterests] = useState('');
  const sectionRef = useRef(null);

  useEffect(() => {
    api
      .me()
      .then((d) => {
        if (d.user) {
          setUser(d.user);
          setCsrf(d.csrfToken);
          setInterests((d.preferences?.interests || []).join(', '));
        }
      })
      .finally(() => setBooting(false));
    api.health().then(setHealth).catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSaveTarget(null);
        setPlayTarget(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Handle OAuth redirect status (?/#status=...) — flash message + auto-populate hero cards
  useEffect(() => {
    const raw = window.location.hash || '';
    const m = raw.match(/status=([^&]+)/);
    if (!m) return;
    const status = decodeURIComponent(m[1]);
    if (window.history?.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search + '#social');
    }

    let msg = null;
    if (status === 'ig_not_configured') {
      msg = 'Instagram is not set up on this server yet. Add INSTAGRAM_CLIENT_ID / INSTAGRAM_CLIENT_SECRET to the .env file, restart the server, then try again.';
    } else if (status === 'google_not_configured') {
      msg = 'Google Sign-In is not set up on this server yet. Add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to the .env file, restart the server, then try again.';
    } else if (status.startsWith('ig_signin:')) {
      const [, label, isNew] = status.split(':');
      msg = `Signed in with Instagram — connected ${label || 'account'}${isNew === 'new' ? ' (new account created)' : ''}`;
    } else if (status.startsWith('auto_connected:instagram:')) {
      msg = `Instagram connected — ${status.slice('auto_connected:instagram:'.length)}`;
    } else if (status.startsWith('auto_connected:')) {
      msg = `Accounts connected: ${status.slice('auto_connected:'.length)}`;
    } else if (status === 'welcome') {
      msg = 'Welcome! Your account was created.';
    } else if (status.startsWith('connect_failed:')) {
      msg = `Connect failed — ${status.slice('connect_failed:'.length)}`;
    } else if (status.startsWith('oauth_error:')) {
      msg = `OAuth error — ${status.slice('oauth_error:'.length)}`;
    } else if (status === 'invalid_state') {
      msg = 'Sign-in session expired. Please try again.';
    } else if (status === 'missing_code') {
      msg = 'Instagram did not return an authorization code.';
    }
    if (msg) setFlash(msg);

    // After Instagram connect/signin: turn the reels into hero cards automatically
    if (status.startsWith('ig_signin') || status.includes('instagram')) {
      const social = window.__REELRING_SOCIAL__;
      if (social) social.setUseSocialFeed(true);
      let tries = 0;
      const pump = () => {
        tries += 1;
        setFeedSignal((s) => s + 1);
        window.__REELRING_SOCIAL__?.fetchSocialFeed().then(() => {
          const n = window.__REELRING_SOCIAL__?.socialVideos?.length ?? 0;
          if (n === 0 && tries < 6) setTimeout(pump, 2500);
        }).catch(() => {
          if (tries < 6) setTimeout(pump, 2500);
        });
      };
      setTimeout(pump, 1500);
    }
  }, []);

  // Auto-open Wrapped when URL contains #...wrapped... (shareable entry point)
  useEffect(() => {
    if (!user) return undefined;
    if (/wrapped/i.test(window.location.hash)) {
      setShowWrapped(true);
      if (window.history?.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + '#social');
      }
    }
    return undefined;
  }, [user]);

  const reloadHealth = useCallback(() => {
    api.accounts().then(setHealth).catch(() => {});
  }, []);

  const onPlay = useCallback(
    (video) => {
      setPlayTarget(video);
      const vid = video.dbId || video.id;
      if (vid) api.logInteraction(vid, 'opened').catch(() => {});
    },
    []
  );

  const onSave = useCallback((video, dbId) => {
    setSaveTarget({ video, dbId });
  }, []);

  const saveInterests = async () => {
    const list = interests.split(',').map((s) => s.trim()).filter(Boolean);
    await api.savePreferences(list);
    setFlash('Interests saved — they feed the For You ranking');
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setCsrf(null);
  };

  const tabs = ['feed', 'search', 'collections', 'connect', 'hero', 'profile'];

  return (
    <section className="section sv-section" id="social" aria-labelledby="social-title" ref={sectionRef}>
      <div className="section-head">
        <div>
          <p className="section-kicker">05 — Universal</p>
          <h2 className="section-title" id="social-title">
            Social feed
          </h2>
        </div>
        <p className="section-note">YouTube + Instagram · official APIs only</p>
      </div>

      {booting ? (
        <p className="sv-empty">Checking session…</p>
      ) : !user ? (
        <AuthPanel
          onAuthed={(u) => {
            setUser(u);
            reloadHealth();
          }}
        />
      ) : (
        <>
          <div className="sv-topbar">
            <div className="sv-chips" role="tablist" aria-label="Social sections">
              {tabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={`sv-chip${tab === t ? ' is-active' : ''}`}
                  onClick={() => setTab(t)}
                >
                  {t === 'feed' ? 'My Feed' : t === 'search' ? 'Search' : t === 'collections' ? 'Collections' : t === 'connect' ? 'Connect' : t === 'hero' ? 'Hero' : 'Profile'}
                </button>
              ))}
            </div>
            <div className="sv-topbar-right">
              <button type="button" className="sv-btn sv-btn-small sv-wrapped-btn" onClick={() => setShowWrapped(true)}>
                Wrapped
              </button>
              <span className="sv-user">{user.displayName || user.email}</span>
              <button type="button" className="sv-btn sv-btn-small sv-btn-ghost" onClick={logout}>
                Sign out
              </button>
            </div>
          </div>

          {flash && <p className="sv-flash sv-flash-top">{flash}</p>}

          {tab === 'connect' && (
            <>
              <ConnectPanel health={health} user={user} onChanged={reloadHealth} />
              <div className="sv-interests">
                <h4>Your interests (improves For You)</h4>
                <div className="sv-search-bar">
                  <input
                    value={interests}
                    onChange={(e) => setInterests(e.target.value)}
                    placeholder="e.g. machine learning, React, cars"
                    aria-label="Interests, comma separated"
                  />
                  <button type="button" className="sv-btn" onClick={saveInterests}>
                    Save interests
                  </button>
                </div>
                {flash && <p className="sv-flash">{flash}</p>}
              </div>
            </>
          )}
          {tab === 'feed' && <FeedPanel user={user} onPlay={onPlay} onSave={onSave} refreshSignal={feedSignal} />}
          {tab === 'search' && <SearchPanel onPlay={onPlay} onSave={onSave} />}
          {tab === 'collections' && <CollectionsPanel onPlay={onPlay} />}
          {tab === 'hero' && <HeroPanel />}
          {tab === 'profile' && <ProfilePanel user={user} />}
        </>
      )}

      <AnimatePresence>
        {saveTarget && (
          <SaveModal
            video={saveTarget.video}
            videoDbId={saveTarget.dbId}
            onClose={() => setSaveTarget(null)}
            onDone={(msg) => {
              setSaveTarget(null);
              setFlash(msg);
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>{playTarget && <PlayerModal video={playTarget} onClose={() => setPlayTarget(null)} />}</AnimatePresence>
      <AnimatePresence>{showWrapped && <WrappedOverlay onClose={() => setShowWrapped(false)} />}</AnimatePresence>
    </section>
  );
}
