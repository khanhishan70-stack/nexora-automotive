import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useSpring } from 'framer-motion';
import Ring from './components/Ring.jsx';
import Loader from './components/Loader.jsx';
import ProfilePage from './components/ProfilePage.jsx';
import { FeedSection, LiveSection, StudioSection, UploadSection, PlayerModal } from './components/Sections.jsx';
import SocialSection from './components/social/SocialSection.jsx';
import { buildReels, preloadReels } from './lib/reels.js';
import { api, setCsrf } from './lib/api.js';

const EASE_DEAL = (t) => t;
const EASE_EXPAND = [0.5, 0, 0.15, 1];
const FORMATION_MS = 2600;
const EXPANSION_MS = 1900;

function getProfileRoute() {
  const m = window.location.pathname.match(/^\/u\/([a-zA-Z0-9_-]+)\/?$/);
  return m ? m[1] : null;
}

export default function App() {
  const profileRoute = getProfileRoute();
  if (profileRoute) return <ProfilePage username={profileRoute} />;
  return <MainApp />;
}

function MainApp() {
  const baseReelsRef = useRef(null);
  if (!baseReelsRef.current) baseReelsRef.current = buildReels();
  const baseReels = baseReelsRef.current;

  const [uploads, setUploads] = useState([]);
  const reels = uploads.length ? [...uploads, ...baseReels] : baseReels;
  const [playerReel, setPlayerReel] = useState(null);

  const [socialVideos, setSocialVideos] = useState([]);
  const [useSocialFeed, setUseSocialFeed] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);

  const formation = useMotionValue(0);
  const expansion = useMotionValue(0);
  const ringTarget = useMotionValue(0);
  const ringAngle = useSpring(ringTarget, { stiffness: 34, damping: 28, mass: 1.1 });

  const interactive = useRef(false);
  const skipRef = useRef(false);
  const brandRef = useRef(null);
  const wordmarkRef = useRef(null);

  const [assetProgress, setAssetProgress] = useState(0);
  const [captionT, setCaptionT] = useState(0);
  const [phase, setPhase] = useState('loader');
  const [loaderGone, setLoaderGone] = useState(false);
  const [brandFlight, setBrandFlight] = useState(null);

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const isLive = phase === 'live' || reduced;

  const fetchSocialFeed = useCallback(async () => {
    try {
      const data = await api.feed({ category: 'latest', platform: 'all', limit: 100 });
      setSocialVideos(data.items);
    } catch (e) {
      console.warn('Failed to fetch social feed:', e.message);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('no-scroll', !isLive);
    document.body.classList.toggle('no-scroll', !isLive);
  }, [isLive]);

  useEffect(() => {
    if (!isLive) return;
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const id = hash.slice(1).split('&')[0];
    if (!id) return;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView();
    }, 60);
    return () => window.clearTimeout(t);
  }, [isLive]);

  const finishEntrance = useCallback(() => {
    interactive.current = true;
    setPhase('live');
    setLoaderGone(true);
  }, []);

  const skip = useCallback(() => {
    if (skipRef.current || phase === 'live') return;
    skipRef.current = true;
    animate(formation, 1, { duration: 0 });
    animate(expansion, 1, { duration: 0 });
    setAssetProgress(1);
    setCaptionT(1);
    setBrandFlight(null);
    finishEntrance();
  }, [formation, expansion, phase, finishEntrance]);

  useEffect(() => {
    if (reduced) {
      formation.set(1);
      expansion.set(1);
      setAssetProgress(1);
      setCaptionT(1);
      finishEntrance();
      return;
    }

    let cancelled = false;
    let assetsReady = false;
    let formationDone = false;
    let expanded = false;

    const startExpansion = () => {
      if (cancelled || skipRef.current || expanded) return;
      expanded = true;
      interactive.current = true;

      setPhase('handoff');
      setCaptionT(1);

      const brand = brandRef.current;
      const wordmark = wordmarkRef.current;
      if (brand && wordmark) {
        const a = brand.getBoundingClientRect();
        const b = wordmark.getBoundingClientRect();
        const scale = b.height / a.height;
        setBrandFlight({
          x: b.left + b.width / 2 - (a.left + a.width / 2),
          y: b.top + b.height / 2 - (a.top + a.height / 2),
          scale,
        });
      } else {
        setBrandFlight(null);
      }

      animate(expansion, 1, {
        duration: EXPANSION_MS / 1000,
        ease: EASE_EXPAND,
        onComplete: () => {
          if (!skipRef.current) finishEntrance();
        },
      });

      window.setTimeout(() => {
        if (!skipRef.current) setLoaderGone(true);
      }, 700);
    };

    const maybeExpand = () => {
      if (formationDone && assetsReady) startExpansion();
    };

    const fControls = animate(formation, 1, {
      duration: FORMATION_MS / 1000,
      ease: EASE_DEAL,
      onComplete: () => {
        formationDone = true;
        maybeExpand();
      },
    });

    const { done } = preloadReels(reels, (settled, total) => {
      if (cancelled) return;
      setAssetProgress(settled / total);
    });
    done.then(() => {
      if (cancelled) return;
      assetsReady = true;
      maybeExpand();
    });

    return () => {
      cancelled = true;
      fControls.stop();
    };
  }, [reels, formation, expansion, reduced, finishEntrance]);

  useEffect(() => {
    if (isLive) return;
    const t = window.setTimeout(() => skip(), 9000);
    return () => window.clearTimeout(t);
  }, [isLive, skip]);

  useEffect(() => {
    if (phase === 'live' || reduced) return;
    const id = window.setInterval(() => {
      setCaptionT((t) => (t >= 1 ? 1 : t + 0.07));
    }, 90);
    return () => window.clearInterval(id);
  }, [phase, reduced]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') skip();
      if (e.key === 'Tab' && phase !== 'live') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip, phase]);

  useEffect(() => {
    if (phase !== 'live' || reduced) return;
    let raf;
    let last = performance.now();
    const spin = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!skipRef.current && !playerReel) ringTarget.set(ringTarget.get() + dt * 4.2);
      raf = requestAnimationFrame(spin);
    };
    raf = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(raf);
  }, [phase, reduced, ringTarget, playerReel]);

  // Auto-fetch social feed when user becomes live and has connected accounts
  useEffect(() => {
    if (isLive && !socialVideos.length) {
      fetchSocialFeed();
    }
  }, [isLive, fetchSocialFeed, socialVideos.length]);

  const publishReel = useCallback((reel) => {
    setUploads((prev) => [reel, ...prev]);
  }, []);

  // Expose social feed controls to SocialSection via window (simple approach)
  useEffect(() => {
    window.__REELRING_SOCIAL__ = {
      socialVideos,
      setSocialVideos,
      useSocialFeed,
      setUseSocialFeed,
      selectedCollections,
      setSelectedCollections,
      selectedCategories,
      setSelectedCategories,
      fetchSocialFeed,
    };
  }, [socialVideos, useSocialFeed, selectedCollections, selectedCategories]);

  return (
    <div className={`app${isLive ? ' is-live' : ''}`}>
      <div className="hero-shell">
        <div className="frame" aria-hidden="true">
          <span className="frame-corner tl" />
          <span className="frame-corner tr" />
          <span className="frame-corner bl" />
          <span className="frame-corner br" />
          <span className="frame-label">EST. 2026 — VERTICAL FORMAT ONLY</span>
          <span className="frame-label right">DRAG · SWIPE · SCROLL</span>
        </div>

        <header className="header">
          <a className="wordmark" href="#top">
            REELRING
          </a>
          <nav className="nav" aria-label="Primary">
            <a href="#feed">Feed</a>
            <a href="#live">Live</a>
            <a href="#studio">Studio</a>
            <a href="#social">Social</a>
            <a className="nav-cta" href="#upload">
              Upload
            </a>
          </nav>
        </header>

        <main className="hero" id="top">
          <Ring
            reels={reels}
            socialVideos={socialVideos}
            useSocialFeed={useSocialFeed}
            selectedCollections={selectedCollections}
            selectedCategories={selectedCategories}
            formation={formation}
            expansion={expansion}
            ringTarget={ringTarget}
            ringAngle={ringAngle}
            interactive={interactive}
            live={isLive}
          />

          <div className="headline">
            <motion.h1
              initial={false}
              animate={{
                opacity: phase === 'loader' && !reduced ? 0 : 1,
                y: phase === 'loader' && !reduced ? 40 : 0,
              }}
              transition={{ duration: 0.9, ease: EASE_EXPAND, delay: 0.1 }}
            >
              The feed,
              <br />
              in the round.
            </motion.h1>
            <motion.p
              initial={false}
              animate={{
                opacity: phase === 'loader' && !reduced ? 0 : 1,
                y: phase === 'loader' && !reduced ? 24 : 0,
              }}
              transition={{ duration: 0.9, ease: EASE_EXPAND, delay: 0.22 }}
            >
              Sixteen live reels on one spinning wall. Drag it, flick it, fall in — then scroll
              for the full feed.
            </motion.p>
            <motion.a
              className="scroll-cue"
              href="#feed"
              initial={false}
              animate={{ opacity: phase === 'loader' && !reduced ? 0 : 1 }}
              transition={{ duration: 0.8, delay: 0.5 }}
            >
              Scroll for feed <span aria-hidden="true">↓</span>
            </motion.a>
          </div>
        </main>

        {!loaderGone && (
          <>
            <Loader
              progress={assetProgress}
              captionT={captionT}
              brandRef={brandRef}
              visible={phase === 'loader' || phase === 'handoff'}
              brandFlying={!!brandFlight}
            />
            {brandFlight && (
              <motion.div
                className="brand-ghost"
                aria-hidden="true"
                initial={{ x: 0, y: 0, scale: 1 }}
                animate={{ x: brandFlight.x, y: brandFlight.y, scale: brandFlight.scale }}
                transition={{ duration: 0.85, ease: EASE_EXPAND }}
              >
                REELRING
              </motion.div>
            )}
          </>
        )}

        {(phase === 'loader' || phase === 'handoff') && !reduced && (
          <button className="skip" onClick={skip} type="button">
            Skip intro <span aria-hidden="true">→</span>
          </button>
        )}
      </div>

      {isLive && (
        <div className="sections">
          <FeedSection reels={reels} onOpen={setPlayerReel} />
          <LiveSection reels={reels} />
          <StudioSection reels={reels} uploads={uploads} />
          <UploadSection onPublish={publishReel} />
          <SocialSection
            socialVideos={socialVideos}
            useSocialFeed={useSocialFeed}
            setUseSocialFeed={setUseSocialFeed}
            selectedCollections={selectedCollections}
            setSelectedCollections={setSelectedCollections}
            selectedCategories={selectedCategories}
            setSelectedCategories={setSelectedCategories}
            fetchSocialFeed={fetchSocialFeed}
          />
          <footer className="footer">
            <span>REELRING © 2026</span>
            <span>Built with React + Motion + CSS 3D. No WebGL.</span>
          </footer>
        </div>
      )}

      {playerReel && <PlayerModal reel={playerReel} onClose={() => setPlayerReel(null)} />}

      <p className="sr-only" role="status" aria-live="polite">
        {isLive ? 'Ready. Carousel loaded.' : 'Loading reels.'}
      </p>
    </div>
  );
}