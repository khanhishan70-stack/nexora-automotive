export const CARD_COUNT = 16;

export const SCENE_START = Object.freeze({
  radius: 460,
  tilt: -22,
  roll: -20,
  perspective: 1000,
  cardScale: 0.52,
});

export const SCENE_END = Object.freeze({
  radius: 1800,
  tilt: 0,
  roll: 0,
  perspective: 450,
  cardScale: 2.3,
});

export function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function easeOutCubic(t) {
  const p = clamp01(t);
  return 1 - Math.pow(1 - p, 3);
}

export function normalizeAngle(a) {
  return ((a % 360) + 360) % 360;
}

export function restAngle(slot, count = CARD_COUNT) {
  return (normalizeAngle(slot) * 360) / count;
}

export function dealProgress(formation, angle, dealSpan = 0.42) {
  const order = normalizeAngle(angle) / 360;
  const start = order * (1 - dealSpan);
  return clamp01((formation - start) / dealSpan);
}

export function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}

export function lerpScene(formationOrExpansion, from = SCENE_START, to = SCENE_END) {
  const t = clamp01(formationOrExpansion);
  return {
    radius: lerp(from.radius, to.radius, t),
    tilt: lerp(from.tilt, to.tilt, t),
    roll: lerp(from.roll, to.roll, t),
    perspective: lerp(from.perspective, to.perspective, t),
    cardScale: lerp(from.cardScale, to.cardScale, t),
  };
}

/**
 * The whole animation lives here.
 * angle      resting angle of the slot in degrees (0 = far centre, ±180 = nearest camera)
 * formation  0..1 loader deal-out progress
 * scene      { radius, cardScale, cardY, cameraZ, dealSpan }
 *
 * Returns { x, y, z, yaw, scale, appear, behindCamera }
 */
export function reelPose(angle, formation, scene = {}) {
  const {
    radius = SCENE_START.radius,
    cardScale = SCENE_START.cardScale,
    cardY = 0,
    cameraZ = 0,
    dealSpan = 0.42,
  } = scene;

  const p = dealProgress(formation, angle, dealSpan);
  const swung = angle * easeOutCubic(p);
  const a = (swung * Math.PI) / 180;

  const x = -Math.sin(a) * radius;
  const z = -Math.cos(a) * radius;

  return {
    x: x === 0 ? 0 : x,
    y: cardY,
    z: z === 0 ? 0 : z,
    yaw: swung,
    scale: cardScale,
    appear: p,
    behindCamera: z > cameraZ + 1e-6,
  };
}
