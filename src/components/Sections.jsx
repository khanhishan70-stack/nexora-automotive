import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { coverSvg } from '../lib/reels.js';

const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));

function CardMedia({ reel, className }) {
  if (reel.src) {
    return (
      <video
        className={className}
        src={reel.src}
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
      />
    );
  }
  return <img className={className} src={reel.cover} alt="" draggable={false} />;
}

export function FeedSection({ reels, onOpen }) {
  return (
    <section className="section" id="feed" aria-labelledby="feed-title">
      <div className="section-head">
        <div>
          <p className="section-kicker">01 — Stream</p>
          <h2 className="section-title" id="feed-title">
            The feed
          </h2>
        </div>
        <p className="section-note">{reels.length} reels · updated live</p>
      </div>
      <div className="feed-grid">
        {reels.map((reel) => (
          <button
            key={reel.id}
            type="button"
            className={`feed-card${reel.isNew ? ' is-new' : ''}`}
            onClick={() => onOpen(reel)}
            aria-label={`Play ${reel.title} by ${reel.author}`}
          >
            <CardMedia reel={reel} className="feed-card-media" />
            <span className="feed-card-veil" aria-hidden="true" />
            {reel.isNew && <span className="feed-card-new">NEW</span>}
            <span className="feed-card-live">
              <span className="card-live-dot" aria-hidden="true" />
              LIVE
            </span>
            <span className="feed-card-meta">
              <span className="feed-card-title">{reel.title}</span>
              <span className="feed-card-sub">
                {reel.author} · {reel.views}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function LiveSection({ reels }) {
  const featured = reels.slice(0, 6);
  const [counts, setCounts] = useState(() =>
    featured.map((r, i) => 820 + i * 1307 + (r.index % 7) * 311)
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setCounts((prev) =>
        prev.map((c, i) => Math.max(60, c + Math.floor(Math.sin(Date.now() / 1400 + i * 2.1) * 38 + (i % 2 ? 9 : -4))))
      );
    }, 1600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="section" id="live" aria-labelledby="live-title">
      <div className="section-head">
        <div>
          <p className="section-kicker">02 — Now</p>
          <h2 className="section-title" id="live-title">
            Live right now
          </h2>
        </div>
        <p className="section-note">
          <span className="pulse-dot" aria-hidden="true" /> {featured.length} channels broadcasting
        </p>
      </div>
      <ul className="live-list">
        {featured.map((reel, i) => (
          <li key={reel.id} className="live-row">
            <span className="live-rank">{String(i + 1).padStart(2, '0')}</span>
            <CardMedia reel={reel} className="live-thumb" />
            <span className="live-info">
              <span className="live-name">{reel.title}</span>
              <span className="live-handle">{reel.author}</span>
            </span>
            <span className="live-viewers">
              <span className="pulse-dot" aria-hidden="true" />
              {fmt(counts[i])} watching
            </span>
            <span className="live-bar" aria-hidden="true">
              <span
                className="live-bar-fill"
                style={{ width: `${28 + ((counts[i] % 70) + Math.abs(Math.sin(i)) * 10)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function StudioSection({ reels, uploads }) {
  const bars = useMemo(() => {
    const rand = (n) => {
      let a = n * 9301 + 49297;
      return ((a % 233280) / 233280);
    };
    return Array.from({ length: 14 }, (_, i) => 22 + rand(i + uploads.length * 3) * 78);
  }, [uploads.length]);

  const totalViews = 41_800_000 + uploads.length * 1240;
  const watchTime = 96_400 + uploads.length * 320;

  const stats = [
    { label: 'Total views', value: fmt(totalViews) },
    { label: 'Watch time (hrs)', value: fmt(watchTime) },
    { label: 'Subscribers', value: fmt(182_000 + uploads.length * 14) },
    { label: 'Reels published', value: String(36 + uploads.length) },
  ];

  return (
    <section className="section" id="studio" aria-labelledby="studio-title">
      <div className="section-head">
        <div>
          <p className="section-kicker">03 — Analytics</p>
          <h2 className="section-title" id="studio-title">
            Studio
          </h2>
        </div>
        <p className="section-note">last 14 days</p>
      </div>
      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <span className="stat-value">{s.value}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </div>
      <div className="chart" role="img" aria-label="Views per day for the last 14 days">
        {bars.map((h, i) => (
          <div className="chart-col" key={i}>
            <div className="chart-bar" style={{ height: `${h}%` }} />
            <span className="chart-tick">{i % 2 === 0 ? i + 1 : ''}</span>
          </div>
        ))}
      </div>
      <table className="studio-table">
        <thead>
          <tr>
            <th>Top reels</th>
            <th>Views</th>
            <th>Likes</th>
            <th>Shares</th>
          </tr>
        </thead>
        <tbody>
          {reels.slice(0, 5).map((r, i) => (
            <tr key={r.id}>
              <td>
                <span className="studio-row-title">{r.title}</span>
                <span className="studio-row-handle">{r.author}</span>
              </td>
              <td>{r.views}</td>
              <td>{(parseFloat(r.views) * 8.4).toFixed(1)}M</td>
              <td>{(parseFloat(r.views) * 0.9).toFixed(1)}M</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function UploadSection({ onPublish }) {
  const inputRef = useRef(null);
  const [pending, setPending] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(-1);
  const [doneTitle, setDoneTitle] = useState(null);

  const takeFile = (file) => {
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      setPending({ error: 'Needs a video or image file' });
      return;
    }
    const url = URL.createObjectURL(file);
    const raw = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Untitled reel';
    setPending({
      file,
      url,
      isVideo,
      title: raw.toUpperCase(),
      sizeMB: (file.size / 1048576).toFixed(1),
    });
    setProgress(-1);
    setDoneTitle(null);
  };

  const publish = () => {
    if (!pending || pending.error || progress >= 0) return;
    setProgress(0);
    const id = window.setInterval(() => {
      setProgress((p) => {
        const next = p + 4 + Math.random() * 9;
        if (next >= 100) {
          window.clearInterval(id);
          const index = 1000 + Math.floor(Math.random() * 8000);
          onPublish({
            id: `upload-${Date.now()}`,
            index,
            title: pending.title,
            author: '@you',
            cover: pending.isVideo ? coverSvg(index % 40, pending.title) : pending.url,
            preview: pending.isVideo ? coverSvg((index % 40) + 40, pending.title) : pending.url,
            src: pending.isVideo ? pending.url : null,
            views: '0',
            href: `#upload-${Date.now()}`,
            isNew: true,
          });
          setDoneTitle(pending.title);
          setPending(null);
          return 100;
        }
        return next;
      });
    }, 120);
  };

  return (
    <section className="section" id="upload" aria-labelledby="upload-title">
      <div className="section-head">
        <div>
          <p className="section-kicker">04 — Publish</p>
          <h2 className="section-title" id="upload-title">
            Upload a reel
          </h2>
        </div>
        <p className="section-note">mp4, mov, webm · 9:16 recommended</p>
      </div>

      <div
        className={`dropzone${dragOver ? ' is-over' : ''}${doneTitle ? ' is-done' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          takeFile(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,image/*"
          className="sr-only"
          onChange={(e) => takeFile(e.target.files?.[0])}
        />

        {doneTitle ? (
          <>
            <p className="dropzone-done-title">Published — “{doneTitle}”</p>
            <p className="dropzone-hint">It’s live at the top of the feed.</p>
            <a className="btn-solid" href="#feed">
              View in feed
            </a>
          </>
        ) : pending && !pending.error ? (
          <div className="pending">
            {pending.isVideo ? (
              <video className="pending-preview" src={pending.url} muted loop autoPlay playsInline />
            ) : (
              <img className="pending-preview" src={pending.url} alt="" />
            )}
            <div className="pending-info">
              <p className="pending-name">{pending.title}</p>
              <p className="pending-meta">
                {pending.isVideo ? 'VIDEO' : 'IMAGE'} · {pending.sizeMB} MB
              </p>
              {progress >= 0 ? (
                <div className="pending-progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemax={100}>
                  <span className="pending-progress-fill" style={{ width: `${progress}%` }} />
                </div>
              ) : (
                <div className="pending-actions">
                  <button type="button" className="btn-solid" onClick={publish}>
                    Publish to feed
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setPending(null)}>
                    Choose another
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="dropzone-title">{pending?.error ?? 'Drop a video here'}</p>
            <p className="dropzone-hint">or pick a file from your device</p>
            <button type="button" className="btn-solid" onClick={() => inputRef.current?.click()}>
              Choose file
            </button>
          </>
        )}
      </div>
    </section>
  );
}

export function PlayerModal({ reel, onClose }) {
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Player — ${reel.title}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        onClick={onClose}
      >
        <motion.div
          className="modal-panel"
          initial={{ y: 40, scale: 0.96 }}
          animate={{ y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.5, 0, 0.15, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-stage">
            {reel.src ? (
              <video className="modal-media" src={reel.src} poster={reel.cover || undefined} controls autoPlay loop playsInline />
            ) : (
              <>
                <img className="modal-media" src={reel.cover} alt="" />
                <span className="modal-progress" aria-hidden="true">
                  <span className="modal-progress-fill" />
                </span>
              </>
            )}
          </div>
          <div className="modal-side">
            <p className="modal-handle">{reel.author}</p>
            <h3 className="modal-title">{reel.title}</h3>
            <p className="modal-stats">
              {reel.views} views · 92% likes · {reel.isNew ? 'just now' : 'today'}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className={`btn-solid${liked ? ' is-liked' : ''}`}
                onClick={() => setLiked((v) => !v)}
                aria-pressed={liked}
              >
                {liked ? '♥ Liked' : '♡ Like'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => navigator.clipboard?.writeText(`${location.origin}${reel.href}`)}
              >
                Copy link
              </button>
            </div>
            <button type="button" className="modal-close" onClick={onClose}>
              Close (Esc)
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
