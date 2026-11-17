/**
 * Painter 的 Cocos 实现：用 Graphics 画形状、用 Label 对象池画文字。
 * 每帧整屏重画；Label 节点复用，只在内容变化时更新，避免频繁创建节点。
 */
import { Color, Graphics, Label, Node, UITransform } from 'cc';
import { Align, Painter, parseColor } from '../ui/painter';

class TextPool {
    private labels: Label[] = [];
    private used = 0;

    constructor(private root: Node) {}

    begin(): void { this.used = 0; }

    next(): Label {
        let label = this.labels[this.used];
        if (!label) {
            const node = new Node(`t${this.used}`);
            node.layer = this.root.layer;
            node.addComponent(UITransform);
            label = node.addComponent(Label);
            label.overflow = Label.Overflow.NONE;
            label.cacheMode = Label.CacheMode.CHAR;
            this.root.addChild(node);
            this.labels.push(label);
        }
        label.node.active = true;
        this.used++;
        return label;
    }

    end(): void {
        for (let i = this.used; i < this.labels.length; i++) {
            if (this.labels[i].node.active) this.labels[i].node.active = false;
        }
    }
}

interface Layer { g: Graphics; texts: TextPool }

const ALIGN_ANCHOR: Record<Align, number> = { left: 0, center: 0.5, right: 1 };
const ALIGN_H: Record<Align, number> = {
    left: Label.HorizontalAlign.LEFT,
    center: Label.HorizontalAlign.CENTER,
    right: Label.HorizontalAlign.RIGHT,
};

export class CocosPainter implements Painter {
    private layers: Layer[] = [];
    private cur!: Layer;
    private w = 720;
    private h = 1280;
    private colors = new Map<string, Color>();

    constructor(root: Node) {
        for (let i = 0; i < 2; i++) {
            const gNode = new Node(`layer${i}-shapes`);
            gNode.layer = root.layer;
            gNode.addComponent(UITransform);
            const g = gNode.addComponent(Graphics);
            root.addChild(gNode);
            const tNode = new Node(`layer${i}-texts`);
            tNode.layer = root.layer;
            tNode.addComponent(UITransform);
            root.addChild(tNode);
            this.layers.push({ g, texts: new TextPool(tNode) });
        }
        this.cur = this.layers[0];
    }

    private color(c: string): Color {
        let col = this.colors.get(c);
        if (!col) {
            const [r, g, b, a] = parseColor(c);
            col = new Color(r, g, b, a);
            this.colors.set(c, col);
        }
        return col;
    }

    private X(x: number): number { return x - this.w / 2; }
    private Y(y: number): number { return this.h / 2 - y; }

    begin(width: number, height: number): void {
        this.w = width;
        this.h = height;
        for (const l of this.layers) {
            l.g.clear();
            l.texts.begin();
        }
        this.cur = this.layers[0];
    }

    end(): void {
        for (const l of this.layers) l.texts.end();
    }

    layer(index: 0 | 1): void {
        this.cur = this.layers[index];
    }

    private rectPath(x: number, y: number, w: number, h: number, radius: number): void {
        const g = this.cur.g;
        if (radius > 0) g.roundRect(this.X(x), this.Y(y + h), w, h, radius);
        else g.rect(this.X(x), this.Y(y + h), w, h);
    }

    fillRect(x: number, y: number, w: number, h: number, color: string, radius = 0): void {
        const g = this.cur.g;
        g.fillColor = this.color(color);
        this.rectPath(x, y, w, h, radius);
        g.fill();
    }

    strokeRect(x: number, y: number, w: number, h: number, color: string, lineWidth: number, radius = 0): void {
        const g = this.cur.g;
        g.strokeColor = this.color(color);
        g.lineWidth = lineWidth;
        this.rectPath(x, y, w, h, radius);
        g.stroke();
    }

    private polyPath(pts: number[], closed: boolean): void {
        const g = this.cur.g;
        g.moveTo(this.X(pts[0]), this.Y(pts[1]));
        for (let i = 2; i < pts.length; i += 2) g.lineTo(this.X(pts[i]), this.Y(pts[i + 1]));
        if (closed) g.close();
    }

    fillPoly(pts: number[], color: string): void {
        const g = this.cur.g;
        g.fillColor = this.color(color);
        this.polyPath(pts, true);
        g.fill();
    }

    strokePoly(pts: number[], color: string, lineWidth: number, closed = true): void {
        const g = this.cur.g;
        g.strokeColor = this.color(color);
        g.lineWidth = lineWidth;
        this.polyPath(pts, closed);
        g.stroke();
    }

    fillCircle(x: number, y: number, r: number, color: string): void {
        const g = this.cur.g;
        g.fillColor = this.color(color);
        g.circle(this.X(x), this.Y(y), r);
        g.fill();
    }

    strokeCircle(x: number, y: number, r: number, color: string, lineWidth: number): void {
        const g = this.cur.g;
        g.strokeColor = this.color(color);
        g.lineWidth = lineWidth;
        g.circle(this.X(x), this.Y(y), r);
        g.stroke();
    }

    text(str: string, x: number, y: number, size: number, color: string, align: Align = 'left', bold = false): void {
        const label = this.cur.texts.next();
        if (label.string !== str) label.string = str;
        if (label.fontSize !== size) {
            label.fontSize = size;
            label.lineHeight = Math.round(size * 1.25);
        }
        if (label.isBold !== bold) label.isBold = bold;
        if (label.horizontalAlign !== ALIGN_H[align]) label.horizontalAlign = ALIGN_H[align];
        label.color = this.color(color);
        const tf = label.node.getComponent(UITransform)!;
        if (tf.anchorX !== ALIGN_ANCHOR[align]) tf.setAnchorPoint(ALIGN_ANCHOR[align], 0.5);
        label.node.setPosition(this.X(x), this.Y(y));
    }
}
