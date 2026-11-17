/**
 * 浏览器预览：不需要安装 Cocos，直接在浏览器里试玩同一套逻辑和界面。
 * npm run preview 然后打开 http://localhost:8080
 */
import { GameUI } from '../client/assets/scripts/ui/GameUI';
import { createAdService } from '../client/assets/scripts/platform/ads';
import { Align, Painter } from '../client/assets/scripts/ui/painter';

const FONT = '"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","WenQuanYi Zen Hei",sans-serif';

class CanvasPainter implements Painter {
    constructor(private ctx: CanvasRenderingContext2D) {}
    begin(w: number, h: number) { this.ctx.clearRect(0, 0, w, h); }
    end() {}
    layer() {}
    private path(x: number, y: number, w: number, h: number, r = 0) {
        const c = this.ctx;
        c.beginPath();
        if (r > 0 && c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
    }
    fillRect(x: number, y: number, w: number, h: number, color: string, r = 0) {
        this.path(x, y, w, h, r); this.ctx.fillStyle = color; this.ctx.fill();
    }
    strokeRect(x: number, y: number, w: number, h: number, color: string, lw: number, r = 0) {
        this.path(x, y, w, h, r); this.ctx.strokeStyle = color; this.ctx.lineWidth = lw; this.ctx.stroke();
    }
    private poly(pts: number[], closed = true) {
        const c = this.ctx;
        c.beginPath();
        c.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
        if (closed) c.closePath();
    }
    fillPoly(pts: number[], color: string) { this.poly(pts); this.ctx.fillStyle = color; this.ctx.fill(); }
    strokePoly(pts: number[], color: string, lw: number, closed = true) {
        this.poly(pts, closed); this.ctx.strokeStyle = color; this.ctx.lineWidth = lw; this.ctx.stroke();
    }
    fillCircle(x: number, y: number, r: number, color: string) {
        const c = this.ctx; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = color; c.fill();
    }
    strokeCircle(x: number, y: number, r: number, color: string, lw: number) {
        const c = this.ctx; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.strokeStyle = color; c.lineWidth = lw; c.stroke();
    }
    text(str: string, x: number, y: number, size: number, color: string, align: Align = 'left', bold = false) {
        const c = this.ctx;
        c.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
        c.fillStyle = color;
        c.textAlign = align;
        c.textBaseline = 'middle';
        c.fillText(str, x, y);
    }
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const ui = new GameUI(createAdService());
const painter = new CanvasPainter(ctx);
const DESIGN_W = 720;
let scale = 1;

function layout() {
    const ratio = Math.min(Math.max(window.innerHeight / window.innerWidth, 1.55), 2.2);
    const designH = Math.round(DESIGN_W * ratio);
    scale = Math.min(window.innerWidth / DESIGN_W, window.innerHeight / designH);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${DESIGN_W * scale}px`;
    canvas.style.height = `${designH * scale}px`;
    canvas.width = Math.round(DESIGN_W * scale * dpr);
    canvas.height = Math.round(designH * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ui.resize(DESIGN_W, designH);
}
window.addEventListener('resize', layout);
layout();

canvas.addEventListener('pointerup', e => {
    const rect = canvas.getBoundingClientRect();
    ui.tap((e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
});

let last = performance.now();
function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    ui.update(dt);
    ui.render(painter);
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 调试用：在控制台里可以用 __ui.game 查看/修改状态
(window as unknown as { __ui: GameUI }).__ui = ui;
