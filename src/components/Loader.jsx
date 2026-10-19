import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789░▒█/\\<>·×';

function scrambleTo(text, t) {
  if (t >= 1) return text;
  return text
    .split('')
    .map((ch, i) => {
      if (ch === ' ') return ' ';
      const seed = Math.sin(i * 91.7 + Math.floor(t * 14) * 13.1) * 43758.5453;
      const frac = seed - Math.floor(seed);
      if (frac < t * 1.4) return ch;
      const g = Math.floor(frac * GLYPHS.length) % GLYPHS.length;
      return GLYPHS[g];
    })
    .join('');
}

function Digit({ value }) {
  const step = useMotionValue(0);
  const y = useTransform(step, (v) => `${-v * 10}%`);

  useEffect(() => {
    const controls = animate(step, value, {
      type: 'spring',
      stiffness: 380,
      damping: 34,
      mass: 0.6,
    });
    return () => controls.stop();
  }, [value, step]);

  return (
    <span className="digit" aria-hidden="true">
      <motion.span className="digit-track" style={{ y }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <span className="digit-cell" key={d}>
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

export default function Loader({ progress, captionT, brandRef, visible, brandFlying }) {
  const pct = Math.round(progress * 100);
  const hundreds = Math.floor(pct / 100);
  const tens = Math.floor((pct % 100) / 10);
  const ones = pct % 10;
  const caption = scrambleTo('Loading Reels', captionT);

  return (
    <motion.div
      className="loader"
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.7, ease: [0.5, 0, 0.15, 1] }}
      aria-hidden={!visible}
    >
      <div className="loader-grain" aria-hidden="true" />
      <div className={`loader-brandline${brandFlying ? ' is-gone' : ''}`}>
        <span className="loader-brand" ref={brandRef}>
          REELRING
        </span>
        <span className="loader-brand-dot" aria-hidden="true" />
      </div>

      <div className="loader-center">
        <div
          className="loader-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label="Loading reels"
        >
          <motion.div className="loader-bar-fill" style={{ scaleX: progress }} />
        </div>
        <div className="loader-caption" aria-hidden="true">
          {caption}
        </div>
      </div>

      <div className="loader-counter">
        <span className="loader-digits">
          {hundreds > 0 && <Digit value={hundreds} />}
          <Digit value={tens} />
          <Digit value={ones} />
        </span>
        <span className="loader-percent">%</span>
      </div>
    </motion.div>
  );
}
