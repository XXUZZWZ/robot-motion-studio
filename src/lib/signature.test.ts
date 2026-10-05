import { describe, expect, it } from 'vitest';
import { sampleSignature, SIGNATURE, solveArm } from './signature';
describe('signature arm trajectory', () => {
  it('keeps every pen target reachable and preserves link lengths', () => {
    for (let i = 0; i <= 1000; i++) {
      const { point: [x, y] } = sampleSignature(i / 1000);
      const [ex, ey] = solveArm(x, y);
      expect(Math.hypot(ex, ey + 1.75)).toBeCloseTo(2.85, 8);
      expect(Math.hypot(x - ex, y - ey)).toBeCloseTo(2.65, 8);
    }
  });
  it('lifts the pen between strokes without drawing connecting lines', () => {
    expect(SIGNATURE.segments.some(s => !s.draw && s.a[2] > .4)).toBe(true);
    for (const s of SIGNATURE.segments.filter(s => s.draw)) {
      expect(s.a[2]).toBe(.12); expect(s.b[2]).toBe(.12);
    }
    for (let i = 1; i < SIGNATURE.segments.length; i++) {
      SIGNATURE.segments[i].a.forEach((n, axis) => expect(n).toBeCloseTo(SIGNATURE.segments[i - 1].b[axis], 10));
    }
  });
  it('supports exact endpoints and backward seeking', () => {
    expect(sampleSignature(0).point).toEqual(SIGNATURE.segments[0].a);
    expect(sampleSignature(1).point).toEqual(SIGNATURE.segments.at(-1)!.b);
    const atHalf = sampleSignature(.5); sampleSignature(.9);
    expect(sampleSignature(.5)).toEqual(atHalf);
  });
});
