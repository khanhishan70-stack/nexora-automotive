import { useEffect, useRef, useState } from 'react';
import { useAnimationFrame } from 'framer-motion';
import { reelPose, lerpScene, lerp, normalizeAngle } from '../lib/pose.js';
import { SLOT_COUNT } from '../lib/reels.js';

const DEG = Math.PI / 180;
const VISUAL_CONE = 100;

function signedAngle(world) {
  return ((world + 180) % 360 + 360) % 360 - 180;
}

function buildSocialReel(video, index) {
  return {
    index: index + 1,
    id: video.id || `social-${video.platform}-${video.platformVideoId}`,
    title: video.title || 'Untitled',
    author: video.creatorName || video.platform,
    views: video.viewCount ? `${(video.viewCount / 1e6).toFixed(1)}M` : '—',
    cover: video.thumbnailUrl || `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960"><rect fill="#1a1a2e" width="540" height="960"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#fff" font-family="monospace" font-size="24">${video.title || 'Loading...'}</text></svg>`)}`,
    preview: video.thumbnailUrl || `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960"><rect fill="#1a1a2e" width="540" height="960"/></svg>`)}`,
    href: video.sourceUrl || `#${video.platform}-${video.platformVideoId}`,
    src: video.sourceUrl || null,
    platform: video.platform,
    platformVideoId: video.platformVideoId,
    isLive: video.isLive,
    duration: video.duration,
    _raw: video,
  };
}

export default function Ring({
  reels,
  socialVideos,
  useSocialFeed,
  selectedCollections,
  selectedCategories,
  formation,
  expansion,
  ringTarget,
  ringAngle,
  interactive,
  live,
  onProductOpen,
}) {
  const stageRef = useRef(null);
  const ringRef = useRef(null);
  const cardRefs = useRef([]);
  const slotReels = useRef(
    Array.from({ length: SLOT_COUNT }, (_, i) => i)
  );
  const lastBehind = useRef(Array(SLOT_COUNT).fill(false));
  const lastWritten = useRef(
    Array.from({ length: SLOT_COUNT }, () => ({ t: '', o: -1, v: '', active: null }))
  );
  const lastShared = useRef({ ring: null, tilt: null, roll: null, persp: null });
  const pointer = useRef({ x: -1, y: -1, down: false, lastX: 0, vel: 0, moved: false });
  const frame = useRef(0);
  const [hovered, setHovered] = useState(-1);
  const [socialReels, setSocialReels] = useState([]);

  useEffect(() => {
    if (useSocialFeed && socialVideos.length > 0) {
      const built = socialVideos.map(buildSocialReel);
      setSocialReels(built);
    } else {
      setSocialReels([]);
    }
  }, [useSocialFeed, socialVideos]);

  const activeReels = useSocialFeed && socialReels.length > 0 ? socialReels : reels;
  const totalReels = activeReels.length;

  useEffect(() => {
    const onResize = () => {
      lastShared.current = { ring: null, tilt: null, roll: null, persp: null };
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useAnimationFrame(() => {
    const stage = stageRef.current;
    const ring = ringRef.current;
    if (!stage || !ring) return;

    frame.current += 1;
    const e = expansion.get();
    const f = formation.get();
    const scene = lerpScene(e);
    const ringA = ringAngle.get();
    const camZ = lerp(2600, 40, e);

    const shared = lastShared.current;
    if (shared.ring !== ringA) {
      ring.style.setProperty('--ring-angle', `${ringA}deg`);
      shared.ring = ringA;
    }
    if (shared.tilt !== scene.tilt) {
      ring.style.setProperty('--tilt', `${scene.tilt}deg`);
      shared.tilt = scene.tilt;
    }
    if (shared.roll !== scene.roll) {
      ring.style.setProperty('--roll', `${scene.roll}deg`);
      shared.roll = scene.roll;
    }
    if (shared.persp !== scene.perspective) {
      stage.style.setProperty('--persp', `${scene.perspective}px`);
      shared.persp = scene.perspective;
    }

    for (let i = 0; i < SLOT_COUNT; i++) {
      const el = cardRefs.current[i];
      if (!el) continue;

      const rest = (i * 360) / SLOT_COUNT;
      const pose = reelPose(rest, f, {
        radius: scene.radius,
        cardScale: scene.cardScale,
        cameraZ: camZ,
      });
      const world = rest + ringA;
      const signed = signedAngle(world);
      const behind = pose.behindCamera;

      const written = lastWritten.current[i];

      const t = `translate(-50%, -50%) translate3d(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px, ${pose.z.toFixed(2)}px) rotateY(${pose.yaw.toFixed(3)}deg) scale(${pose.scale.toFixed(4)})`;
      if (t !== written.t) {
        el.style.transform = t;
        written.t = t;
      }

      const o = behind ? 0 : pose.appear;
      if (o !== written.o) {
        el.style.opacity = o.toFixed(3);
        written.o = o;
      }

      const v = behind && f >= 1 ? 'hidden' : 'visible';
      if (v !== written.v) {
        el.style.visibility = v;
        written.v = v;
      }

      if (behind && !lastBehind.current[i]) {
        slotReels.current[i] = (slotReels.current[i] + SLOT_COUNT) % totalReels;
        const reel = activeReels[slotReels.current[i]];
        const cover = el.querySelector('.card-cover');
        const preview = el.querySelector('.card-preview');
        const title = el.querySelector('.card-title');
         const author = el.querySelector('.card-author');
         const price = el.querySelector('.card-price');
         const description = el.querySelector('.card-product-description');
         const offer = el.querySelector('.card-offer');
         const idx = el.querySelector('.card-index');
         if (cover) { cover.onerror = () => { cover.onerror = null; cover.src = reel.fallbackCover || ''; }; cover.src = reel.cover; }
         if (preview) { preview.onerror = () => { preview.onerror = null; preview.src = reel.fallbackPreview || reel.fallbackCover || ''; }; preview.src = reel.preview; }
         if (title) title.textContent = reel.title;
         if (description) description.textContent = reel.description || reel.title;
         if (author) author.textContent = reel.author;
         if (price) price.textContent = reel.price || reel.views;
         if (offer) offer.textContent = reel.discount || '';
        if (idx) idx.textContent = String(reel.index).padStart(2, '0');
        el.href = reel.href;
        el.setAttribute('aria-label', `Open ${reel.title} by ${reel.author}`);
      }
      lastBehind.current[i] = behind;

      const active = f >= 1 && !behind && Math.abs(signed) < VISUAL_CONE;
      if (active !== written.active) {
        el.classList.toggle('is-playing', active);
        written.active = active;
      }
    }

    if (frame.current % 3 === 0) {
      const { x, y } = pointer.current;
      if (x < 0) {
        if (hovered !== -1) setHovered(-1);
      } else {
        const hit = document.elementFromPoint(x, y);
        const card = hit && hit.closest ? hit.closest('.card') : null;
        const slot = card ? Number(card.dataset.slot) : -1;
        if (slot !== hovered) setHovered(slot);
      }
    }
  });

  const onPointerDown = (ev) => {
    if (!interactive.current) return;
    pointer.current.down = true;
    pointer.current.moved = false;
    pointer.current.lastX = ev.clientX;
    pointer.current.vel = 0;
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
  };

  const onPointerMove = (ev) => {
    pointer.current.x = ev.clientX;
    pointer.current.y = ev.clientY;
    if (!pointer.current.down || !interactive.current) return;
    const dx = ev.clientX - pointer.current.lastX;
    pointer.current.lastX = ev.clientX;
    if (Math.abs(dx) > 2) pointer.current.moved = true;
    pointer.current.vel = dx;
    ringTarget.set(ringTarget.get() - dx * 0.22);
  };

  const onPointerUp = () => {
    if (pointer.current.down && interactive.current) {
      ringTarget.set(ringTarget.get() - pointer.current.vel * 6);
    }
    pointer.current.down = false;
    pointer.current.vel = 0;
  };

  const onPointerLeave = () => {
    pointer.current.x = -1;
    pointer.current.y = -1;
    if (hovered !== -1) setHovered(-1);
  };

  const onWheel = (ev) => {
    if (!interactive.current) {
      ev.preventDefault();
      return;
    }
    const d = Math.abs(ev.deltaY) > Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX;
    ringTarget.set(ringTarget.get() + d * 0.12);
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  });

  return (
    <div className={`stage${live ? ' is-live' : ''}`} ref={stageRef} style={{ '--persp': '1000px' }}>
      <div
        className="ring"
        ref={ringRef}
        style={{ '--ring-angle': '0deg', '--tilt': '-22deg', '--roll': '-20deg' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      >
        {Array.from({ length: SLOT_COUNT }, (_, i) => {
          const reel = activeReels[slotReels.current[i]];
          return (
            <a
              key={i}
              className={`card${hovered === i ? ' is-hovered' : ''}`}
              data-slot={i}
              href={reel.href}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${reel.title} by ${reel.author}`}
              ref={(el) => (cardRefs.current[i] = el)}
              style={{ opacity: 0, transform: 'translate(-50%, -50%)' }}
              tabIndex={interactive.current ? 0 : -1}
              onClick={(event) => {
                if (pointer.current.moved) {
                  event.preventDefault();
                  pointer.current.moved = false;
                  return;
                }
                if (onProductOpen) {
                  event.preventDefault();
                  onProductOpen(reel);
                }
              }}
            >
              <span className="card-face">
                 <img className="card-cover" src={reel.cover} alt={`${reel.title} product image`} draggable={false} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = reel.fallbackCover || ''; }} />
                 <img className="card-preview" src={reel.preview} alt="" draggable={false} onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = reel.fallbackPreview || reel.fallbackCover || ''; }} />
                <span className="card-sheen" aria-hidden="true" />
                <span className="card-index">{String(reel.index).padStart(2, '0')}</span>
                <span className="card-live">
                  <span className="card-live-dot" aria-hidden="true" />
                  {reel.isLive ? 'LIVE' : reel.platform?.toUpperCase()}
                </span>
                {reel.discount && <span className="card-offer">{reel.discount}</span>}
                <span className="card-meta">
                  <span className="card-title">{reel.title}</span>
                  <span className="card-product-description">{reel.description}</span>
                  <span className="card-sub">
                    <span className="card-author">{reel.author}</span>
                    <span className="card-price">{reel.price}</span>
                  </span>
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
