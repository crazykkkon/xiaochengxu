/**
 * 极简绘图接口。GameUI 只通过它画东西，因此同一套界面代码
 * 既能跑在 Cocos（CocosPainter），也能跑在浏览器 Canvas（web-preview）。
 *
 * 坐标系：左上角为原点，x 向右，y 向下，单位是设计分辨率像素。
 * 颜色：'#rrggbb' 或 '#rrggbbaa'。
 */
export type Align = 'left' | 'center' | 'right';

export interface Painter {
    begin(width: number, height: number): void;
    end(): void;
    /** 0 = 主层，1 = 弹窗层（总是画在主层所有内容之上，包括文字） */
    layer(index: 0 | 1): void;
    fillRect(x: number, y: number, w: number, h: number, color: string, radius?: number): void;
    strokeRect(x: number, y: number, w: number, h: number, color: string, lineWidth: number, radius?: number): void;
    /** pts = [x0, y0, x1, y1, ...] */
    fillPoly(pts: number[], color: string): void;
    strokePoly(pts: number[], color: string, lineWidth: number, closed?: boolean): void;
    fillCircle(x: number, y: number, r: number, color: string): void;
    strokeCircle(x: number, y: number, r: number, color: string, lineWidth: number): void;
    /** y 为文字垂直中心 */
    text(str: string, x: number, y: number, size: number, color: string, align?: Align, bold?: boolean): void;
}

export function parseColor(c: string): [number, number, number, number] {
    const h = c.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
    return [r, g, b, a];
}

const hex2 = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');

export function toColor(r: number, g: number, b: number, a = 255): string {
    return `#${hex2(r)}${hex2(g)}${hex2(b)}${a >= 255 ? '' : hex2(a)}`;
}

export function mixColor(c1: string, c2: string, t: number): string {
    const a = parseColor(c1);
    const b = parseColor(c2);
    const k = Math.max(0, Math.min(1, t));
    return toColor(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k);
}

export function withAlpha(c: string, alpha: number): string {
    const [r, g, b] = parseColor(c);
    return toColor(r, g, b, alpha * 255);
}

/** 粗略估算文字宽度（中文按 1 个字号宽，其余按 0.55） */
export function measureText(str: string, size: number): number {
    let w = 0;
    for (const ch of str) w += ch.charCodeAt(0) > 0x2e80 ? size : size * 0.55;
    return w;
}

/** 按宽度自动换行，保留原有的 \n */
export function wrapText(str: string, maxWidth: number, size: number): string[] {
    const lines: string[] = [];
    for (const para of str.split('\n')) {
        let line = '';
        for (const ch of para) {
            if (measureText(line + ch, size) > maxWidth && line) {
                lines.push(line);
                line = ch;
            } else {
                line += ch;
            }
        }
        lines.push(line);
    }
    return lines;
}
