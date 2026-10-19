import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useSpring } from 'framer-motion';
import Ring from './components/Ring.jsx';
import Loader from './components/Loader.jsx';
import { buildReels, preloadReels } from './lib/reels.js';

const EASE_EXPAND = [0.5, 0, 0.15, 1];

export default function App() {
  const reelsRef = useRef(null);
  if (!reelsRef.current) reelsRef.current = buildReels();
  const reels = reelsRef.current;
  const formation = useMotionValue(0);
  const expansion = useMotionValue(0);
  const ringTarget = useMotionValue(0);
  const ringAngle = useSpring(ringTarget, { stiffness: 34, damping: 28, mass: 1.1 });
  const brandRef = useRef(null);
  const interactive = useRef(false);
  const skipRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [captionT, setCaptionT] = useState(0);
  const [phase, setPhase] = useState('loader');
  const [brandFlight, setBrandFlight] = useState(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const live = phase === 'live' || reduced;

  const finish = useCallback(() => { interactive.current = true; setPhase('live'); }, []);
  const skip = useCallback(() => {
    if (skipRef.current || live) return;
    skipRef.current = true; formation.set(1); expansion.set(1); setProgress(1); setCaptionT(1); setBrandFlight(null); finish();
  }, [expansion, finish, formation, live]);

  useEffect(() => {
    if (reduced) { formation.set(1); expansion.set(1); setProgress(1); setCaptionT(1); finish(); return undefined; }
    let cancelled = false; let formed = false; let assets = false; let expanded = false;
    const beginExpansion = () => {
      if (cancelled || skipRef.current || expanded || !formed || !assets) return;
      expanded = true; setPhase('handoff'); setCaptionT(1);
      const brand = brandRef.current;
      const wordmark = document.querySelector('.wordmark');
      if (brand && wordmark) { const a = brand.getBoundingClientRect(); const b = wordmark.getBoundingClientRect(); setBrandFlight({ x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2), scale: b.height / a.height }); }
      animate(expansion, 1, { duration: 1.9, ease: EASE_EXPAND, onComplete: () => { if (!skipRef.current) finish(); } });
    };
    const deal = animate(formation, 1, { duration: 2.6, ease: 'linear', onComplete: () => { formed = true; beginExpansion(); } });
    const loaded = preloadReels(reels, (settled, total) => { if (!cancelled) setProgress(settled / total); });
    loaded.done.then(() => { assets = true; beginExpansion(); });
    return () => { cancelled = true; deal.stop(); };
  }, [expansion, finish, formation, reduced, reels]);

  useEffect(() => { if (live) return undefined; const t = setTimeout(skip, 9000); return () => clearTimeout(t); }, [live, skip]);
  useEffect(() => { if (live || reduced) return undefined; const id = setInterval(() => setCaptionT(t => Math.min(1, t + .07)), 90); return () => clearInterval(id); }, [live, reduced]);
  useEffect(() => { const onKey = e => { if (e.key === 'Escape' || e.key === 'Tab') skip(); }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [skip]);
  useEffect(() => { if (!live || reduced) return undefined; let raf; let last = performance.now(); const tick = now => { const dt = Math.min((now - last) / 1000, .05); last = now; if (!document.hidden && !skipRef.current) ringTarget.set(ringTarget.get() + dt * 4.2); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [live, reduced, ringTarget]);
  useEffect(() => { document.documentElement.classList.toggle('no-scroll', !live); document.body.classList.toggle('no-scroll', !live); return () => { document.documentElement.classList.remove('no-scroll'); document.body.classList.remove('no-scroll'); }; }, [live]);

  return <div className={`app${live ? ' is-live' : ''}`}>
    <div className="hero-shell" id="top">
      <div className="frame" aria-hidden="true"><span className="frame-label">EST. 2026 — VERTICAL FORMAT ONLY</span><span className="frame-label right">DRAG · SWIPE · SCROLL</span></div>
      <header className="header"><a className="wordmark" href="#top">REELRING</a><nav><a href="#feed">Feed</a><a href="#about">About</a><a href="#archive">Archive</a><a className="nav-cta" href="#feed">Explore</a></nav></header>
      <main className="hero"><Ring reels={reels} formation={formation} expansion={expansion} ringTarget={ringTarget} ringAngle={ringAngle} interactive={interactive} live={live}/><div className="headline"><motion.h1 animate={{ opacity: live ? 1 : 0, y: live ? 0 : 32 }} transition={{ duration: .9, ease: EASE_EXPAND }}>The feed,<br/>in the round.</motion.h1><motion.p animate={{ opacity: live ? 1 : 0, y: live ? 0 : 20 }} transition={{ duration: .9, delay: .12, ease: EASE_EXPAND }}>Sixteen live reels on one spinning wall. Drag it, flick it, fall in — then scroll for the full feed.</motion.p><a className="scroll-cue" href="#feed">Scroll for feed <span>↓</span></a></div></main>
      {!live && <Loader progress={progress} captionT={captionT} brandRef={brandRef} visible={phase !== 'live'} brandFlying={!!brandFlight}/>} {brandFlight && <motion.div className="brand-ghost" initial={{x:0,y:0,scale:1}} animate={brandFlight} transition={{duration:.85,ease:EASE_EXPAND}}>REELRING</motion.div>}
      {!reduced && !live && <button className="skip" onClick={skip}>Skip intro <span>→</span></button>}
    </div>
    {live && <section className="feed-section" id="feed"><p className="kicker">THE WALL / 01</p><h2>Sixteen windows.<br/><em>One endless scroll.</em></h2><p className="feed-copy">A vertical-first space for ideas in motion. Drag the wall above or continue down for the complete signal.</p><div className="feed-rule"/><div className="feed-grid">{reels.slice(0,8).map(reel => <a href={reel.href} key={reel.id}><img src={reel.cover} alt=""/><span>{reel.title}</span></a>)}</div></section>}
    <footer id="about"><span>REELRING © 2026</span><span>Built with React + Motion + CSS 3D.</span></footer>
    <p className="sr-only" role="status" aria-live="polite">{live ? 'Carousel ready.' : 'Loading reels.'}</p>
  </div>;
}
