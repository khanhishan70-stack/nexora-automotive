import { useEffect, useMemo, useState } from 'react';
import { useMotionValue, useSpring } from 'framer-motion';
import Ring from './Ring.jsx';
import { api } from '../lib/api.js';

function placeholderCover(label) {
  const safe = String(label || 'Reel').replace(/[<>&"']/g, '').slice(0, 24);
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960">' +
    '<rect fill="#111" width="540" height="960"/>' +
    '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#666" font-family="monospace" font-size="22">' +
    safe +
    '</text></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function placeholderBlank() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960"><rect fill="#111" width="540" height="960"/></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function buildProfileReels(videos) {
  if (!videos.length) return [];
  return videos.map((v, i) => ({
    index: i + 1,
    id: v.id,
    title: v.title || 'Untitled',
    author: v.creatorName || 'Creator',
    views: v.viewCount ? `${(v.viewCount / 1e6).toFixed(1)}M` : '—',
    cover: v.thumbnailUrl || placeholderCover(v.title),
    preview: v.thumbnailUrl || placeholderBlank(),
    href: v.sourceUrl || `#${v.platform}-${v.platformVideoId}`,
    platform: v.platform,
    platformVideoId: v.platformVideoId,
    isLive: v.isLive,
    duration: v.duration,
    _raw: v,
  }));
}

export default function ProfilePage({ username }) {
  const [profile, setProfile] = useState(null);
  const [videos, setVideos] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const formation = useMotionValue(1);
  const expansion = useMotionValue(1);
  const ringTarget = useMotionValue(0);
  const ringAngle = useSpring(ringTarget, { stiffness: 34, damping: 28, mass: 1.1 });
  const interactive = useMemo(() => ({ current: true }), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([api.getProfile(username), api.getProfileVideos(username)])
      .then(([p, v]) => {
        if (cancelled) return;
        setProfile(p.profile);
        setVideos(v.videos);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.status === 404 ? 'Profile not found or private.' : e.message);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [username]);

  useEffect(() => {
    if (!profile) return;
    document.title = `${profile.displayName} — REELRING`;
    document.documentElement.style.setProperty('--profile-accent', profile.accentColor || '#ff2d55');
    return () => { document.title = 'REELRING'; document.documentElement.style.removeProperty('--profile-accent'); };
  }, [profile]);

  useEffect(() => {
    if (!videos.length) return;
    let raf;
    let last = performance.now();
    const spin = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      ringTarget.set(ringTarget.get() + dt * 4.2);
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(raf);
  }, [videos.length, ringTarget]);

  const reels = useMemo(() => buildProfileReels(videos), [videos]);
  const hasReels = reels.length > 0;

  if (loading) {
    return (
      <div className="pp-root pp-loading">
        <div className="pp-loading-ring" aria-hidden="true" />
        <p>Loading profile…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pp-root pp-error">
        <div className="pp-error-code">404</div>
        <p>{error}</p>
        <a className="pp-cta" href="/">Back to REELRING</a>
      </div>
    );
  }

  const platforms = profile.platforms || [];

  return (
    <div className="pp-root" style={{ '--pp-accent': profile.accentColor || '#ff2d55' }}>
      <header className="pp-header">
        <a className="pp-brand" href="/">REELRING</a>
        <div className="pp-header-actions">
          <button
            className="pp-share-btn"
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
            }}
          >
            Copy link
          </button>
          <a className="pp-cta" href="/">Create yours →</a>
        </div>
      </header>

      <section className="pp-hero">
        <div className="pp-identity">
          <div className="pp-avatar" aria-hidden="true">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" />
            ) : (
              <span>{(profile.displayName || '?').charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="pp-id-text">
            <h1>{profile.displayName}</h1>
            <span className="pp-handle">@{profile.username}</span>
            {profile.bio && <p className="pp-bio">{profile.bio}</p>}
            <div className="pp-meta">
              <span className="pp-meta-item">{profile.videoCount} video{profile.videoCount === 1 ? '' : 's'}</span>
              {platforms.map((p) => (
                <span key={p} className={`pp-platform pp-platform-${p}`}>{p}</span>
              ))}
            </div>
          </div>
        </div>

        {profile.collections.length > 0 && (
          <div className="pp-collections" aria-label="Collections">
            {profile.collections.map((c) => (
              <span key={c.id} className="pp-collection-chip" title={c.description || ''}>
                {c.name}
              </span>
            ))}
          </div>
        )}
      </section>

      {hasReels ? (
        <section className="pp-stage-wrap" aria-label={`${profile.displayName}'s reel carousel`}>
          <Ring
            reels={reels}
            socialVideos={[]}
            useSocialFeed={false}
            selectedCollections={[]}
            selectedCategories={[]}
            formation={formation}
            expansion={expansion}
            ringTarget={ringTarget}
            ringAngle={ringAngle}
            interactive={interactive}
            live={true}
          />
        </section>
      ) : (
        <section className="pp-empty">
          <p>No public reels yet.</p>
        </section>
      )}

      {reels.length > 0 && (
        <section className="pp-grid" aria-label="All reels">
          {reels.map((r) => (
            <a key={r.id} className="pp-grid-card" href={r.href} target="_blank" rel="noreferrer">
              <img src={r.cover} alt="" loading="lazy" />
              <div className="pp-grid-info">
                <span className="pp-grid-title">{r.title}</span>
                <span className="pp-grid-author">{r.author}</span>
              </div>
            </a>
          ))}
        </section>
      )}

      <footer className="pp-footer">
        <span>Made with <a href="/">REELRING</a> — the feed, in the round.</span>
      </footer>
    </div>
  );
}
