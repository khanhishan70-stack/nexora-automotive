import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../lib/api.js';

const PERIODS = [
  { id: 'year', label: 'This Year' },
  { id: '30d', label: 'Last 30 Days' },
  { id: 'all', label: 'All Time' },
];

function periodLabel(p) {
  if (p === 'year') return String(new Date().getFullYear());
  if (p === '30d') return 'Last 30 Days';
  return 'All Time';
}

function useCountUp(target, dur = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (target == null) return undefined;
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return n;
}

function BigNumber({ value, suffix = '' }) {
  const n = useCountUp(value);
  return (
    <motion.span
      className="wr-big"
      initial={{ scale: 0.7, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 180, damping: 16 }}
    >
      {n.toLocaleString()}
      {suffix}
    </motion.span>
  );
}

function drawWrappedCard(data, accent, period) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  ctx.fillStyle = '#050508';
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, H + 120, 60, W / 2, H + 120, 900);
  glow.addColorStop(0, accent + 'cc');
  glow.addColorStop(0.5, accent + '44');
  glow.addColorStop(1, accent + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(120, -80, 40, 120, -80, 620);
  glow2.addColorStop(0, '#7928ca66');
  glow2.addColorStop(1, '#7928ca00');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = accent;
  ctx.fillRect(64, 72, 120, 8);

  ctx.fillStyle = '#f4f2ee';
  ctx.font = '700 58px Inter, Helvetica, Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('REELRING', 64, 112);
  ctx.fillStyle = accent;
  ctx.fillText(' WRAPPED', 64 + ctx.measureText('REELRING').width, 112);

  ctx.fillStyle = 'rgba(244,242,238,0.5)';
  ctx.font = '600 34px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText(periodLabel(period).toUpperCase(), 64, 192);

  ctx.fillStyle = '#f4f2ee';
  ctx.font = '800 64px Inter, Helvetica, Arial, sans-serif';
  const name = data.displayName || data.username || 'Creator';
  ctx.fillText(name, 64, 280);
  ctx.fillStyle = accent;
  ctx.font = '500 32px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillText('@' + (data.username || ''), 64, 360);

  const rows = [
    ['REELS SAVED', data.savesInPeriod.toLocaleString()],
    ['REELS OPENED', data.counts.opened.toLocaleString()],
    ['TOP CREATOR', data.topCreators[0]?.name || '—'],
    ['DAY STREAK', String(data.streakDays)],
    ['SEARCHES', data.counts.searched.toLocaleString()],
    ['WATCH MINUTES', data.watchMinutes.toLocaleString()],
  ];

  let y = 470;
  ctx.font = '600 26px ui-monospace, Menlo, Consolas, monospace';
  rows.forEach(([label, value], i) => {
    ctx.fillStyle = 'rgba(244,242,238,0.42)';
    ctx.fillText(label, 64, y);
    ctx.fillStyle = i % 2 === 0 ? '#f4f2ee' : accent;
    ctx.font = '800 52px Inter, Helvetica, Arial, sans-serif';
    ctx.fillText(String(value), 64, y + 36);
    ctx.font = '600 26px ui-monospace, Menlo, Consolas, monospace';
    ctx.strokeStyle = 'rgba(244,242,238,0.1)';
    ctx.beginPath();
    ctx.moveTo(64, y + 128);
    ctx.lineTo(W - 64, y + 128);
    ctx.stroke();
    y += 148;
  });

  ctx.fillStyle = 'rgba(244,242,238,0.45)';
  ctx.font = '500 28px Inter, Helvetica, Arial, sans-serif';
  ctx.fillText('the feed, in the round.', 64, H - 96);
  ctx.fillStyle = accent;
  ctx.font = '600 28px ui-monospace, Menlo, Consolas, monospace';
  const host = window.location.host;
  ctx.fillText(host + '/u/' + (data.username || ''), 64, H - 56);

  return canvas;
}

export default function WrappedOverlay({ onClose }) {
  const [period, setPeriod] = useState('year');
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [index, setIndex] = useState(0);
  const [accent, setAccent] = useState('#ff2d55');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    api
      .me()
      .then((d) => {
        if (d.profile?.accentColor) setAccent(d.profile.accentColor);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setErr(null);
    api
      .wrapped(period)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [period]);

  const slidesCount = 7;
  const next = useCallback(() => setIndex((i) => Math.min(slidesCount - 1, i + 1)), []);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose, next, prev]);

  // Auto-advance story-style (not on title or share slides, not while loading)
  useEffect(() => {
    if (!data || index === 0 || index === slidesCount - 1) return undefined;
    const t = window.setTimeout(() => setIndex((i) => Math.min(slidesCount - 1, i + 1)), 6500);
    return () => window.clearTimeout(t);
  }, [data, index]);

  const onSurfaceClick = (e) => {
    if (e.target.closest('button, a, input')) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (e.clientX - rect.left < rect.width * 0.35) prev();
    else next();
  };

  const downloadCard = () => {
    if (!data) return;
    setBusy(true);
    try {
      const canvas = drawWrappedCard(data, accent, period);
      canvas.toBlob((blob) => {
        setBusy(false);
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reelring-wrapped-${period}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }, 'image/png');
    } catch {
      setBusy(false);
    }
  };

  const copyCaption = () => {
    if (!data) return;
    const top = data.topCreators[0]?.name;
    const text =
      `My REELRING Wrapped ${periodLabel(period)}: saved ${data.savesInPeriod} reels` +
      (top ? `, top creator ${top}` : '') +
      `, ${data.streakDays}-day streak. The feed, in the round — ` +
      `${window.location.origin}/u/${data.username || ''}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const safe = (v, fallback = 0) => (v == null ? fallback : v);

  const renderSlide = () => {
    if (err) {
      return (
        <div className="wr-slide">
          <p className="wr-kicker">Oops</p>
          <p className="wr-error">{err}</p>
        </div>
      );
    }
    if (!data && index === 0) {
      return (
        <div className="wr-slide">
          <p className="wr-kicker">Your REELRING Wrapped</p>
          <p className="wr-loading">Crunching your numbers…</p>
        </div>
      );
    }
    if (!data) return <div className="wr-slide"><p className="wr-loading">Loading…</p></div>;

    switch (index) {
      case 0:
        return (
          <div className="wr-slide wr-title-slide">
            <span className="wr-year">{periodLabel(period)}</span>
            <h2 className="wr-title">
              YOUR
              <br />
              WRAPPED
            </h2>
            <p className="wr-sub">
              {data.displayName}, this is your year in reels — {data.librarySize.toLocaleString()} videos in your
              library, {data.collectionCount} collections.
            </p>
            <div className="wr-period-chips">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`wr-chip${period === p.id ? ' is-active' : ''}`}
                  onClick={() => {
                    setPeriod(p.id);
                    setIndex(0);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button type="button" className="wr-cta" onClick={next}>
              Start the story →
            </button>
          </div>
        );
      case 1:
        return (
          <div className="wr-slide">
            <p className="wr-kicker">You saved</p>
            <BigNumber value={data.savesInPeriod} />
            <p className="wr-sub">reels into your collections {periodLabel(period).toLowerCase() === 'all time' ? 'of all time' : `in ${periodLabel(period)}`}. Hoarder energy — we love it.</p>
          </div>
        );
      case 2:
        return (
          <div className="wr-slide">
            <p className="wr-kicker">Your top creators</p>
            {data.topCreators.length === 0 ? (
              <p className="wr-sub">No creator stats yet — open a few reels first.</p>
            ) : (
              <ol className="wr-rank">
                {data.topCreators.map((c, i) => (
                  <motion.li
                    key={c.name}
                    initial={{ x: -30, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className={i === 0 ? 'is-first' : ''}
                  >
                    <span className="wr-rank-pos">{i + 1}</span>
                    <span className="wr-rank-name">{c.name}</span>
                    <span className="wr-rank-count">{c.count}</span>
                  </motion.li>
                ))}
              </ol>
            )}
          </div>
        );
      case 3: {
        const yt = safe(data.platforms.youtube);
        const ig = safe(data.platforms.instagram);
        const total = Math.max(1, yt + ig);
        const ytPct = Math.round((yt / total) * 100);
        return (
          <div className="wr-slide">
            <p className="wr-kicker">Platform split</p>
            <div className="wr-bars">
              <div className="wr-bar-row">
                <span className="wr-bar-label">YouTube</span>
                <div className="wr-bar-track">
                  <motion.div
                    className="wr-bar-fill wr-bar-yt"
                    initial={{ width: 0 }}
                    animate={{ width: `${ytPct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
                <span className="wr-bar-num">{ytPct}%</span>
              </div>
              <div className="wr-bar-row">
                <span className="wr-bar-label">Instagram</span>
                <div className="wr-bar-track">
                  <motion.div
                    className="wr-bar-fill wr-bar-ig"
                    initial={{ width: 0 }}
                    animate={{ width: `${100 - ytPct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut', delay: 0.15 }}
                  />
                </div>
                <span className="wr-bar-num">{100 - ytPct}%</span>
              </div>
            </div>
            <p className="wr-sub">
              {yt + ig === 0 ? 'Connect an account to see your platform split.' : `${yt + ig} plays tracked across both platforms.`}
            </p>
          </div>
        );
      }
      case 4:
        return (
          <div className="wr-slide">
            <p className="wr-kicker">Your streak</p>
            <BigNumber value={data.streakDays} suffix=" days" />
            <p className="wr-sub">
              Longest run of consecutive active days. Also: you swiped away{' '}
              <strong>{data.counts.notInterested}</strong> reels — picky tastemaker.
            </p>
          </div>
        );
      case 5:
        return (
          <div className="wr-slide">
            <p className="wr-kicker">The fine print</p>
            <div className="wr-grid">
              <div className="wr-cell">
                <span className="wr-cell-num">{data.counts.searched.toLocaleString()}</span>
                <span className="wr-cell-label">searches</span>
              </div>
              <div className="wr-cell">
                <span className="wr-cell-num">{data.watchMinutes.toLocaleString()}</span>
                <span className="wr-cell-label">minutes watched</span>
              </div>
              <div className="wr-cell">
                <span className="wr-cell-num">{data.counts.opened.toLocaleString()}</span>
                <span className="wr-cell-label">reels opened</span>
              </div>
              <div className="wr-cell">
                <span className="wr-cell-num">{data.topCollection ? data.topCollection.name : '—'}</span>
                <span className="wr-cell-label">
                  {data.topCollection ? `top collection (${data.topCollection.count})` : 'no saves yet'}
                </span>
              </div>
            </div>
          </div>
        );
      case 6:
        return (
          <div className="wr-slide wr-share-slide">
            <p className="wr-kicker">Flex it</p>
            <h3 className="wr-share-title">Download your card</h3>
            <p className="wr-sub">1080×1350 poster with your stats — perfect for stories and posts.</p>
            <div className="wr-share-actions">
              <button type="button" className="wr-cta" onClick={downloadCard} disabled={busy}>
                {busy ? 'Rendering…' : 'Download image'}
              </button>
              <button type="button" className="wr-cta wr-cta-ghost" onClick={copyCaption}>
                {copied ? 'Caption copied!' : 'Copy caption'}
              </button>
            </div>
            <button type="button" className="wr-finish" onClick={onClose}>
              Done — close
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div
      className="wr-overlay"
      ref={rootRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onSurfaceClick}
      role="dialog"
      aria-modal="true"
      aria-label="REELRING Wrapped"
    >
        <div className="wr-progress" aria-hidden="true">
          {Array.from({ length: slidesCount }, (_, i) => (
            <span key={i} className={`wr-seg${i < index ? ' is-done' : i === index ? ' is-now' : ''}`} />
          ))}
        </div>

        <button
          type="button"
          className="wr-close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close Wrapped"
        >
          ✕
        </button>

        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            className="wr-card"
            initial={{ opacity: 0, y: 26, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.32, ease: 'easeOut' }}
            style={{ '--wr-accent': accent }}
          >
            {renderSlide()}
          </motion.div>
        </AnimatePresence>

        <div className="wr-nav" aria-hidden="false">
          <button type="button" onClick={(e) => { e.stopPropagation(); prev(); }} disabled={index === 0} aria-label="Previous">
            ←
          </button>
          <span className="wr-hint">
            {index === 0 ? 'pick a period, then start' : index === slidesCount - 1 ? 'last slide' : 'tap right to continue · auto-advances'}
          </span>
          <button type="button" onClick={(e) => { e.stopPropagation(); next(); }} disabled={index === slidesCount - 1} aria-label="Next">
            →
          </button>
        </div>
    </motion.div>
  );
}
