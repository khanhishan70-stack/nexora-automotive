import { describe, it, expect } from 'vitest';
import {
  CARD_COUNT,
  SCENE_START,
  SCENE_END,
  clamp01,
  easeOutCubic,
  normalizeAngle,
  restAngle,
  dealProgress,
  lerp,
  lerpScene,
  reelPose,
} from './pose.js';

const round = (n, d = 5) => Number(n.toFixed(d)) || 0;

describe('clamp01', () => {
  it('clamps below zero', () => {
    expect(clamp01(-3)).toBe(0);
  });
  it('clamps above one', () => {
    expect(clamp01(9)).toBe(1);
  });
  it('passes through the middle', () => {
    expect(clamp01(0.42)).toBe(0.42);
  });
});

describe('easeOutCubic', () => {
  it('is 0 at 0 and 1 at 1', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });
  it('eases out — past halfway before t=0.5', () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 6);
  });
  it('is monotonic across the domain', () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it('clamps out-of-range input', () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });
});

describe('normalizeAngle / restAngle', () => {
  it('wraps into [0, 360)', () => {
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(360)).toBe(0);
  });
  it('places 16 slots evenly around the ring', () => {
    for (let s = 0; s < CARD_COUNT; s++) {
      expect(restAngle(s)).toBeCloseTo((s * 360) / CARD_COUNT, 6);
    }
  });
  it('slot 0 is the far centre (0 degrees)', () => {
    expect(restAngle(0)).toBe(0);
  });
  it('slot 8 is nearest the camera (180 degrees)', () => {
    expect(restAngle(8)).toBe(180);
  });
});

describe('dealProgress', () => {
  it('is 0 for every card at formation 0', () => {
    for (let s = 0; s < CARD_COUNT; s++) {
      expect(dealProgress(0, restAngle(s))).toBe(0);
    }
  });
  it('is 1 for every card at formation 1', () => {
    for (let s = 0; s < CARD_COUNT; s++) {
      expect(dealProgress(1, restAngle(s))).toBe(1);
    }
  });
  it('deals in angle order — lower angle leads', () => {
    const early = dealProgress(0.3, restAngle(0));
    const late = dealProgress(0.3, restAngle(12));
    expect(early).toBeGreaterThan(late);
  });
  it('angle 0 leads the deal', () => {
    expect(dealProgress(0.05, 0)).toBeGreaterThan(0);
  });
  it('the last card is still waiting at formation 0.5', () => {
    expect(dealProgress(0.5, restAngle(15))).toBe(0);
  });
});

describe('lerp / lerpScene', () => {
  it('interpolates linearly', () => {
    expect(lerp(0, 100, 0.25)).toBe(25);
    expect(lerp(10, 20, 1)).toBe(20);
  });
  it('blends the full scene from start to end', () => {
    const mid = lerpScene(0.5);
    expect(mid.radius).toBe((SCENE_START.radius + SCENE_END.radius) / 2);
    expect(mid.tilt).toBe((SCENE_START.tilt + SCENE_END.tilt) / 2);
    expect(mid.roll).toBe((SCENE_START.roll + SCENE_END.roll) / 2);
    expect(mid.perspective).toBe((SCENE_START.perspective + SCENE_END.perspective) / 2);
    expect(mid.cardScale).toBeCloseTo((SCENE_START.cardScale + SCENE_END.cardScale) / 2, 6);
  });
  it('endpoints are exact', () => {
    expect(lerpScene(0)).toEqual(SCENE_START);
    expect(lerpScene(1)).toEqual(SCENE_END);
  });
});

describe('reelPose — formation 0 (the stack)', () => {
  it('every card sits at the far centre, stacked as one', () => {
    for (let s = 0; s < CARD_COUNT; s++) {
      const pose = reelPose(restAngle(s), 0, { radius: 460 });
      expect(round(pose.x)).toBe(0);
      expect(round(pose.z)).toBe(-460);
      expect(round(pose.yaw)).toBe(0);
    }
  });
  it('every card is fully transparent', () => {
    for (let s = 0; s < CARD_COUNT; s++) {
      expect(reelPose(restAngle(s), 0).appear).toBe(0);
    }
  });
});

describe('reelPose — formation 1 (the ring)', () => {
  it('slot 0 rests at far centre', () => {
    const pose = reelPose(0, 1, { radius: 460 });
    expect(round(pose.x)).toBe(0);
    expect(round(pose.z)).toBe(-460);
    expect(pose.yaw).toBe(0);
    expect(pose.appear).toBe(1);
    expect(pose.behindCamera).toBe(false);
  });
  it('slot 4 (90 degrees) rests on the left of the ring', () => {
    const pose = reelPose(90, 1, { radius: 460 });
    expect(round(pose.x)).toBe(-460);
    expect(round(pose.z)).toBe(0);
    expect(pose.yaw).toBe(90);
    expect(pose.behindCamera).toBe(false);
  });
  it('slot 8 (180 degrees) rests nearest the camera, and is behind it', () => {
    const pose = reelPose(180, 1, { radius: 460 });
    expect(round(pose.x)).toBe(0);
    expect(round(pose.z)).toBe(460);
    expect(pose.yaw).toBe(180);
    expect(pose.behindCamera).toBe(true);
  });
  it('slot 12 (270 degrees) rests on the right of the ring', () => {
    const pose = reelPose(270, 1, { radius: 460 });
    expect(round(pose.x)).toBe(460);
    expect(round(pose.z)).toBe(0);
    expect(pose.yaw).toBe(270);
  });
  it('x follows -sin(a) * radius for an arbitrary angle', () => {
    const a = 33.3;
    const pose = reelPose(a, 1, { radius: 1800 });
    expect(round(pose.x, 4)).toBe(round(-Math.sin((a * Math.PI) / 180) * 1800, 4));
    expect(round(pose.z, 4)).toBe(round(-Math.cos((a * Math.PI) / 180) * 1800, 4));
    expect(pose.yaw).toBe(a);
  });
});

describe('reelPose — behindCamera', () => {
  it('is false for the far half of the ring', () => {
    expect(reelPose(0, 1, { radius: 460 }).behindCamera).toBe(false);
    expect(reelPose(90, 1, { radius: 460 }).behindCamera).toBe(false);
    expect(reelPose(270, 1, { radius: 460 }).behindCamera).toBe(false);
  });
  it('respects a raised camera plane', () => {
    expect(reelPose(0, 1, { radius: 460, cameraZ: -500 }).behindCamera).toBe(true);
  });
});

describe('reelPose — mid-deal', () => {
  it('the lead card has swung out while laggards are still stacked', () => {
    const lead = reelPose(0, 0.5);
    const laggard = reelPose(restAngle(15), 0.5);
    expect(lead.appear).toBe(1);
    expect(lead.yaw).toBe(0);
    expect(laggard.appear).toBe(0);
    expect(laggard.yaw).toBe(0);
  });
  it('a mid card is part-way through its swing with partial opacity', () => {
    const pose = reelPose(restAngle(4), 0.55);
    expect(pose.appear).toBeGreaterThan(0);
    expect(pose.appear).toBeLessThan(1);
    expect(Math.abs(pose.yaw)).toBeLessThan(Math.abs(restAngle(4)));
    expect(Math.abs(pose.yaw)).toBeGreaterThan(0);
  });
  it('yaw scales exactly with the eased deal', () => {
    const angle = restAngle(6);
    const f = 0.7;
    const pose = reelPose(angle, f);
    expect(round(pose.yaw, 4)).toBe(round(angle * easeOutCubic(dealProgress(f, angle)), 4));
  });
});

describe('reelPose — scales and scene params', () => {
  it('applies cardScale from the scene', () => {
    expect(reelPose(0, 1, { cardScale: 2.3 }).scale).toBe(2.3);
  });
  it('applies cardY from the scene', () => {
    expect(reelPose(0, 1, { cardY: -40 }).y).toBe(-40);
  });
  it('radius moves the ring outward', () => {
    const small = reelPose(45, 1, { radius: 460 });
    const big = reelPose(45, 1, { radius: 1800 });
    expect(Math.hypot(big.x, big.z)).toBeCloseTo(1800, 6);
    expect(Math.hypot(small.x, small.z)).toBeCloseTo(460, 6);
  });
});

describe('reelPose — purity', () => {
  it('does not mutate its arguments', () => {
    const scene = { radius: 460, cardScale: 0.52 };
    const frozen = Object.freeze({ ...scene });
    reelPose(90, 0.5, frozen);
    expect(scene).toEqual({ radius: 460, cardScale: 0.52 });
  });
  it('is deterministic — same inputs, same output', () => {
    const a = reelPose(123, 0.66, { radius: 999 });
    const b = reelPose(123, 0.66, { radius: 999 });
    expect(a).toEqual(b);
  });
  it('defaults scene params when omitted', () => {
    const pose = reelPose(0, 1);
    expect(pose.scale).toBe(SCENE_START.cardScale);
    expect(round(pose.z)).toBe(-SCENE_START.radius);
  });
});
