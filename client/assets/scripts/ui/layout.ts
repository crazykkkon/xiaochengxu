/**
 * 环形地图的几何计算：地块多边形、地块中心、点击命中。
 * 屏幕坐标（y 向下），角度从正上方开始顺时针。
 */
import { RING_COUNT, RING_SECTORS } from '../core/config';

export interface MapGeom {
    cx: number;
    cy: number;
    /** 每一圈的径向宽度（像素）；心泉塔半径 = unit */
    unit: number;
}

const TAU = Math.PI * 2;
const START = -Math.PI / 2;

export function sectorAngles(ring: number, sector: number): [number, number] {
    const n = RING_SECTORS[ring - 1];
    const a0 = START + (sector * TAU) / n;
    return [a0, a0 + TAU / n];
}

/** 扇形地块的多边形（留一点缝隙） */
export function sectorPoly(g: MapGeom, ring: number, sector: number, inset = 2): number[] {
    const [a0, a1] = sectorAngles(ring, sector);
    const r0 = ring * g.unit + inset;
    const r1 = (ring + 1) * g.unit - inset;
    const gap0 = inset / r0;
    const gap1 = inset / r1;
    const steps = Math.max(4, Math.ceil(((a1 - a0) * r1) / 12));
    const pts: number[] = [];
    for (let i = 0; i <= steps; i++) {
        const a = a0 + gap1 + ((a1 - a0 - 2 * gap1) * i) / steps;
        pts.push(g.cx + r1 * Math.cos(a), g.cy + r1 * Math.sin(a));
    }
    for (let i = steps; i >= 0; i--) {
        const a = a0 + gap0 + ((a1 - a0 - 2 * gap0) * i) / steps;
        pts.push(g.cx + r0 * Math.cos(a), g.cy + r0 * Math.sin(a));
    }
    return pts;
}

export function sectorCenter(g: MapGeom, ring: number, sector: number): [number, number] {
    const [a0, a1] = sectorAngles(ring, sector);
    const a = (a0 + a1) / 2;
    const r = (ring + 0.5) * g.unit;
    return [g.cx + r * Math.cos(a), g.cy + r * Math.sin(a)];
}

export type MapHit = { kind: 'tower' } | { kind: 'plot'; ring: number; sector: number } | null;

export function hitTest(g: MapGeom, x: number, y: number): MapHit {
    const dx = x - g.cx;
    const dy = y - g.cy;
    const dist = Math.sqrt(dx * dx + dy * dy) / g.unit;
    if (dist < 1) return { kind: 'tower' };
    const ring = Math.floor(dist);
    if (ring > RING_COUNT) return null;
    let a = Math.atan2(dy, dx) - START;
    a = ((a % TAU) + TAU) % TAU;
    const n = RING_SECTORS[ring - 1];
    const sector = Math.min(n - 1, Math.floor((a / TAU) * n));
    return { kind: 'plot', ring, sector };
}

export function circlePoly(cx: number, cy: number, r: number, steps = 48): number[] {
    const pts: number[] = [];
    for (let i = 0; i < steps; i++) {
        const a = (i / steps) * TAU;
        pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    return pts;
}
