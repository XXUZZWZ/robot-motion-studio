export type Point2 = [number, number];
export type PenPoint = [number, number, number];
const ellipse = (x: number, y: number, rx: number, ry: number, from = 0, to = Math.PI * 2): Point2[] =>
  Array.from({ length: 33 }, (_, i) => { const a = from + (to - from) * i / 32; return [x + Math.cos(a) * rx, y + Math.sin(a) * ry]; });
const glyphs: { width: number; strokes: Point2[][] }[] = [
  { width: .72, strokes: [[[0, 0], [0, 1.16]], [[0, 1.16], [.32, 1.16], ...ellipse(.32, .88, .34, .28, Math.PI / 2, -Math.PI / 2), [0, .6]], [[0, .6], [.34, .6], ...ellipse(.34, .3, .38, .3, Math.PI / 2, -Math.PI / 2), [0, 0]]] },
  { width: .5, strokes: [[[0, 0], [0, .76]], [[0, .5], [.12, .7], [.28, .78], [.48, .73]]] },
  { width: .16, strokes: [[[.08, .74], [.08, 0]], [[.08, 1.02], [.08, 1.045]]] },
  { width: .62, strokes: [ellipse(.31, .37, .31, .37), [[.62, 1.16], [.62, 0]]] },
  { width: .62, strokes: [ellipse(.31, .37, .31, .37), [[.62, .74], [.62, -.2], [.56, -.36], [.38, -.43], [.15, -.42], [0, -.32]]] },
  { width: .62, strokes: [[[0, .39], [.62, .39], ...ellipse(.31, .37, .31, .37, .055, Math.PI * 1.78)]] },
  { width: .62, strokes: [ellipse(.31, .37, .31, .37), [[.62, 1.16], [.62, 0]]] },
  { width: .62, strokes: [[[0, -.43], [0, .74]], ellipse(.31, .37, .31, .37, Math.PI, -Math.PI)] },
];
export type PenSegment = { a: PenPoint; b: PenPoint; draw: boolean; start: number; end: number; inkIndex: number };
export const SIGNATURE_DURATION = 24;
export function createSignature() {
  const segments: PenSegment[] = [];
  let offset = -3.07, total = 0, inkCount = 0;
  let previous: PenPoint | null = null;
  const append = (a: PenPoint, b: PenPoint, draw: boolean) => {
    const length = Math.hypot(...a.map((n, i) => b[i] - n));
    if (length < 1e-8) return;
    segments.push({ a, b, draw, start: total, end: total + length, inkIndex: inkCount });
    total += length; if (draw) inkCount++;
  };
  for (const glyph of glyphs) {
    for (const stroke of glyph.strokes) {
      const points: PenPoint[] = stroke.map(([x, y]) => [offset + x, y + .35, .12]);
      if (previous) {
        const up: PenPoint = [previous[0], previous[1], .48];
        const next: PenPoint = [points[0][0], points[0][1], .48];
        append(previous, up, false); append(up, next, false); append(next, points[0], false);
      }
      points.slice(1).forEach((p, i) => append(points[i], p, true));
      previous = points.at(-1)!;
    }
    offset += glyph.width + .22;
  }
  return { segments, total, inkCount };
}
export const SIGNATURE = createSignature();
export function sampleSignature(progress: number) {
  const distance = Math.max(0, Math.min(1, progress)) * SIGNATURE.total;
  let low = 0, high = SIGNATURE.segments.length - 1;
  while (low < high) { const mid = (low + high) >>> 1; if (SIGNATURE.segments[mid].end < distance) low = mid + 1; else high = mid; }
  const segment = SIGNATURE.segments[low];
  const t = Math.max(0, Math.min(1, (distance - segment.start) / (segment.end - segment.start)));
  const point = segment.a.map((n, i) => n + (segment.b[i] - n) * t) as PenPoint;
  return { segment, point };
}
// Planar two-link IK. The wrist supplies the independent pen-lift axis.
export function solveArm(x: number, y: number): Point2 {
  const baseY = -1.75, a = 2.85, b = 2.65;
  const dy = y - baseY;
  const elbowAngle = Math.acos(Math.max(-1, Math.min(1, (x * x + dy * dy - a * a - b * b) / (2 * a * b))));
  const shoulder = Math.atan2(dy, x) + Math.atan2(b * Math.sin(elbowAngle), a + b * Math.cos(elbowAngle));
  return [Math.cos(shoulder) * a, baseY + Math.sin(shoulder) * a];
}
