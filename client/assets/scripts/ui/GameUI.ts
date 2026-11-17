/**
 * 游戏主界面（与引擎无关）。
 * 每帧：update(dt) 推进逻辑 → render(painter) 重画整个画面；点击时调用 tap(x, y)。
 * Cocos 端由 GameRoot 驱动，浏览器预览由 web-preview/main.ts 驱动。
 */
import { ADS, AdPlacement, BUILD_ORDER, BUILDINGS, BuildingId, CARAVAN_REWARD, EVENTS, RESOURCE_NAMES, RING_COUNT, RING_SECTORS, RULES, ResourceId, TOWER } from '../core/config';
import { ActionResult, Game, Prompt, createState, plotId } from '../core/game';
import { AdService } from '../platform/ads';
import { MapGeom, circlePoly, hitTest, sectorCenter, sectorPoly } from './layout';
import { Painter, mixColor, withAlpha, wrapText } from './painter';

interface Hit { x: number; y: number; w: number; h: number; fn: () => void; modal: boolean }

interface ModalButton { label: string; color: string; fn: () => void }
interface Modal { title: string; text: string; buttons: ModalButton[] }

interface ButtonOpts {
    bg?: string;
    fg?: string;
    size?: number;
    bold?: boolean;
    border?: string;
    modal?: boolean;
}

const COLORS = {
    panel: '#1a1410cc',
    panelSoft: '#1a141099',
    text: '#f4ead8',
    dim: '#b9a98f',
    good: '#8fd694',
    warn: '#f2b84b',
    bad: '#ef6a50',
    accent: '#f0a64a',
    button: '#3b2f25',
    buttonOn: '#c97a2e',
    ad: '#2f9e6b',
};

const TEMP_STOPS: [number, string][] = [
    [0, '#3d5a99'], [12, '#5f8fb5'], [20, '#7fb59a'], [26, '#9cc277'],
    [32, '#e2c25f'], [40, '#e0873f'], [50, '#b53b2a'],
];

export function tempColor(t: number): string {
    if (t <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
    for (let i = 1; i < TEMP_STOPS.length; i++) {
        const [t1, c1] = TEMP_STOPS[i];
        const [t0, c0] = TEMP_STOPS[i - 1];
        if (t <= t1) return mixColor(c0, c1, (t - t0) / (t1 - t0));
    }
    return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}

const TOWER_COLORS = ['#555b66', '#3f8fa6', '#2f7fd0', '#d0552f'];
const LOG_COLORS = { info: COLORS.dim, good: COLORS.good, warn: COLORS.warn, bad: COLORS.bad };

const pad2 = (n: number) => String(n).padStart(2, '0');

export class GameUI {
    game: Game;
    w = 720;
    h = 1280;
    speed = 1;
    tool: BuildingId | null = null;
    selected: string | null = null;
    modal: Modal | null = null;
    busyText: string | null = null;
    private toast: { text: string; t: number } | null = null;
    private hits: Hit[] = [];
    private geom: MapGeom = { cx: 360, cy: 600, unit: 50 };
    private time = 0;
    private readonly topH = 196;
    private readonly bottomH = 420;

    constructor(private ads: AdService, game?: Game) {
        this.game = game ?? new Game(createState((Date.now() & 0x7fffffff) >>> 0));
        this.resize(this.w, this.h);
    }

    resize(w: number, h: number): void {
        this.w = w;
        this.h = h;
        const avail = h - this.topH - this.bottomH - 16;
        const unit = Math.max(20, Math.min((w - 20) / ((RING_COUNT + 1) * 2), avail / ((RING_COUNT + 1) * 2)));
        this.geom = { cx: w / 2, cy: this.topH + 8 + avail / 2, unit };
    }

    // ------------------------------------------------------------ 逻辑

    update(dt: number): void {
        this.time += dt;
        if (this.toast) {
            this.toast.t -= dt;
            if (this.toast.t <= 0) this.toast = null;
        }
        if (this.modal || this.busyText) return;
        if (this.speed > 0) this.game.tick((dt * this.speed) / RULES.secondsPerHour);
        const p = this.game.takePrompt();
        if (p) this.openPrompt(p);
    }

    tap(x: number, y: number): void {
        if (this.busyText) return;
        for (let i = this.hits.length - 1; i >= 0; i--) {
            const h = this.hits[i];
            if (this.modal && !h.modal) continue;
            if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
                h.fn();
                return;
            }
        }
        if (this.modal) return;
        const hit = hitTest(this.geom, x, y);
        if (!hit) {
            this.selected = null;
            return;
        }
        if (hit.kind === 'tower') {
            this.tool = null;
            this.selected = 'tower';
            return;
        }
        const id = plotId(hit.ring, hit.sector);
        const b = this.game.state.buildings[id];
        if (this.tool && !b) {
            this.report(this.game.build(this.tool, hit.ring, hit.sector));
            return;
        }
        this.tool = null;
        this.selected = b ? id : null;
    }

    private report(r: ActionResult): void {
        if (!r.ok && r.reason) this.showToast(r.reason);
    }

    showToast(text: string): void {
        this.toast = { text, t: 2.2 };
    }

    private openPrompt(p: Prompt): void {
        const g = this.game;
        if (p.kind === 'warning') {
            const buttons: ModalButton[] = [];
            if (g.canUseAd('caravan')) {
                const reward = (Object.entries(CARAVAN_REWARD) as [ResourceId, number][])
                    .map(([k, v]) => `${RESOURCE_NAMES[k]}+${v}`).join(' ');
                buttons.push({
                    label: `▶ 看广告：${ADS.caravan.name}（${reward}）`, color: COLORS.ad,
                    fn: () => this.watchAd('caravan', () => g.applyCaravan()),
                });
            }
            buttons.push({ label: '知道了', color: COLORS.button, fn: () => { this.modal = null; } });
            this.modal = { title: p.title, text: p.text, buttons };
        } else if (p.kind === 'gameover') {
            const buttons: ModalButton[] = [];
            if (p.canRevive) {
                buttons.push({
                    label: `▶ 看广告：${ADS.revive.name}`, color: COLORS.ad,
                    fn: () => this.watchAd('revive', () => g.applyRevive(), p),
                });
            }
            buttons.push({ label: '重新开始', color: COLORS.button, fn: () => this.restart() });
            const extra = p.canRevive ? '\n\n「最后的希望」：时间回到今天黎明，并获得一批补给。' : '';
            this.modal = { title: p.title, text: p.text + extra, buttons };
        } else {
            this.modal = {
                title: p.title, text: p.text,
                buttons: [{ label: '再来一局', color: COLORS.buttonOn, fn: () => this.restart() }],
            };
        }
    }

    private watchAd(placement: AdPlacement, apply: () => ActionResult, retryPrompt?: Prompt): void {
        this.modal = null;
        this.busyText = this.ads.name === 'dev' ? '广告播放中…（模拟广告）' : '广告加载中…';
        this.ads.showRewarded(placement).then(ok => {
            this.busyText = null;
            if (ok) {
                this.report(apply());
            } else {
                this.showToast('广告没有看完，未获得奖励');
                if (retryPrompt) this.openPrompt(retryPrompt);
            }
        });
    }

    restart(): void {
        this.game = new Game(createState((Date.now() & 0x7fffffff) >>> 0));
        this.modal = null;
        this.tool = null;
        this.selected = null;
        this.speed = 1;
    }

    // ------------------------------------------------------------ 绘制

    render(p: Painter): void {
        this.hits = [];
        p.begin(this.w, this.h);
        p.layer(0);
        this.drawBackground(p);
        this.drawMap(p);
        this.drawTopHud(p);
        this.drawBottom(p);
        if (this.toast) this.drawToast(p, this.toast.text);
        p.layer(1);
        if (this.modal) this.drawModal(p, this.modal);
        if (this.busyText) {
            p.fillRect(0, 0, this.w, this.h, '#000000cc');
            p.text(this.busyText, this.w / 2, this.h / 2, 30, COLORS.text, 'center', true);
        }
        p.end();
    }

    private button(p: Painter, x: number, y: number, w: number, h: number, label: string, fn: () => void, o: ButtonOpts = {}): void {
        p.fillRect(x, y, w, h, o.bg ?? COLORS.button, Math.min(14, h / 3));
        if (o.border) p.strokeRect(x, y, w, h, o.border, 3, Math.min(14, h / 3));
        p.text(label, x + w / 2, y + h / 2, o.size ?? 22, o.fg ?? COLORS.text, 'center', o.bold);
        this.hits.push({ x, y, w, h, fn, modal: !!o.modal });
    }

    private daylight(): number {
        const hod = this.game.hourOfDay;
        const l = 0.5 - 0.5 * Math.cos((2 * Math.PI * hod) / 24);
        return Math.max(0, Math.min(1, l * 1.6 - 0.3));
    }

    private drawBackground(p: Painter): void {
        const bg = mixColor('#141a2e', '#d9b47c', this.daylight());
        p.fillRect(0, 0, this.w, this.h, bg);
    }

    private drawMap(p: Painter): void {
        const g = this.game;
        const s = g.state;
        const geom = this.geom;
        const u = geom.unit;
        const outside = g.ringTemp(RING_COUNT + 1);

        // 城外沙地
        p.fillPoly(circlePoly(geom.cx, geom.cy, (RING_COUNT + 1) * u + 6, 72), withAlpha(tempColor(outside), 0.35));

        for (let r = 1; r <= RING_COUNT; r++) {
            const t = g.ringTemp(r);
            const base = tempColor(t);
            for (let sc = 0; sc < RING_SECTORS[r - 1]; sc++) {
                const id = plotId(r, sc);
                const b = s.buildings[id];
                const poly = sectorPoly(geom, r, sc);
                let fill = withAlpha(base, 0.6);
                if (b) {
                    if (!b.built) fill = '#6b6255';
                    else if (!b.enabled) fill = '#4a4a4a';
                    else fill = mixColor(base, '#3a2a1e', 0.62);
                }
                p.fillPoly(poly, fill);
                if (this.tool && !b) p.strokePoly(poly, '#ffffff66', 1.5);
                if (this.selected === id) p.strokePoly(poly, '#ffffff', 3);
                if (b) this.drawBuildingLabel(p, id);
            }
        }

        // 心泉塔覆盖范围
        const cov = TOWER.coverage[s.effPower];
        if (cov > 0) p.strokeCircle(geom.cx, geom.cy, (cov + 1) * u, '#9fe3ff88', 2);

        // 心泉塔
        const broken = s.towerBroken > 0;
        const towerColor = broken ? '#2e2e2e' : TOWER_COLORS[s.effPower];
        p.fillCircle(geom.cx, geom.cy, u * 0.92, towerColor);
        if (s.effPower > 0) {
            const pulse = 0.95 + 0.05 * Math.sin(this.time * (s.effPower === 3 ? 8 : 3));
            p.strokeCircle(geom.cx, geom.cy, u * pulse, s.effPower === 3 ? '#ffb38a' : '#bfefff', 2);
        }
        if (this.selected === 'tower') p.strokeCircle(geom.cx, geom.cy, u * 0.92, '#ffffff', 3);
        p.text('心泉塔', geom.cx, geom.cy - u * 0.2, Math.round(u * 0.3), '#ffffff', 'center', true);
        p.text(broken ? '维修中' : TOWER.levelNames[s.effPower], geom.cx, geom.cy + u * 0.25, Math.round(u * 0.26), '#ffffffcc', 'center');

        // 温度图例
        let ly = this.topH + 18;
        const lx = 14;
        p.text('温度', lx, ly, 16, COLORS.text, 'left', true);
        for (let r = 1; r <= RING_COUNT + 1; r++) {
            ly += 21;
            const t = g.ringTemp(r);
            p.fillCircle(lx + 7, ly, 7, tempColor(t));
            p.text(`${r <= RING_COUNT ? `${r}圈` : '城外'} ${Math.round(t)}°`, lx + 20, ly, 15, COLORS.text);
        }
    }

    private drawBuildingLabel(p: Painter, id: string): void {
        const b = this.game.state.buildings[id];
        const def = BUILDINGS[b.type];
        const [x, y] = sectorCenter(this.geom, b.ring, b.sector);
        const u = this.geom.unit;
        p.text(def.glyph, x, y - u * 0.12, Math.round(u * 0.42), '#ffffff', 'center', true);
        let sub = '';
        let col = '#ffffffbb';
        if (!b.built) {
            sub = `${Math.floor((b.progress / def.buildHours) * 100)}%`;
        } else if (!b.enabled) {
            sub = '停工';
        } else if (def.workers > 0) {
            sub = `${b.workers}/${def.workers}`;
            if (b.workers < def.workers) col = COLORS.warn;
        } else if (def.housing) {
            sub = `住${def.housing}`;
        }
        if (sub) p.text(sub, x, y + u * 0.26, Math.round(u * 0.24), col, 'center');
    }

    private drawTopHud(p: Painter): void {
        const g = this.game;
        const s = g.state;
        const w = this.w;
        p.fillRect(0, 0, w, this.topH - 8, COLORS.panel);

        // 第一行：日期时间 + 倍速
        const hod = g.hourOfDay;
        const hh = Math.floor(hod);
        const mm = Math.floor(((hod - hh) * 60) / 10) * 10;
        p.text(`第 ${g.day}/${RULES.winDay} 天  ${pad2(hh)}:${pad2(mm)}`, 18, 30, 28, COLORS.text, 'left', true);
        const amb = Math.round(g.ambientTemp());
        p.text(`${g.isNight() ? '夜晚' : '白天'} ${amb}°`, 300, 30, 22, g.isNight() ? '#a9c4ff' : COLORS.accent);
        const speeds = ['暂停', '1x', '2x', '3x'];
        const bw = 66;
        speeds.forEach((label, i) => {
            const x = w - 12 - (speeds.length - i) * (bw + 6);
            this.button(p, x, 10, bw, 42, label, () => { this.speed = i; }, {
                bg: this.speed === i ? COLORS.buttonOn : COLORS.button, size: 20,
            });
        });

        // 第二行：资源
        const pop = g.population;
        const daily: Record<ResourceId, number> = {
            water: pop * RULES.waterPerPersonPerDay,
            food: pop * RULES.foodPerPersonPerDay,
            fuel: TOWER.fuelPerHour[s.towerPower] * 24,
            parts: 0,
        };
        const ids: ResourceId[] = ['water', 'food', 'fuel', 'parts'];
        const cw = (w - 24) / 4;
        ids.forEach((id, i) => {
            const x = 12 + i * cw;
            const v = Math.floor(s.res[id]);
            const low = daily[id] > 0 && v < daily[id] / 2;
            p.fillRect(x + 3, 62, cw - 6, 40, '#00000044', 10);
            p.text(RESOURCE_NAMES[id], x + 14, 82, 18, COLORS.dim);
            p.text(String(v), x + cw - 14, 82, 24, low ? COLORS.bad : COLORS.text, 'right', true);
        });

        // 第三行：人口 + 民心
        p.text(`人口 ${pop}`, 18, 128, 22, COLORS.text, 'left', true);
        const status: string[] = [];
        if (s.sick > 0) status.push(`病${s.sick}`);
        if (s.homeless > 0) status.push(`无家${s.homeless}`);
        const idle = s.workers - Object.values(s.buildings).reduce((a, b) => a + b.workers, 0);
        if (idle > 0) status.push(`闲${idle}`);
        p.text(status.join(' '), 125, 128, 17, s.homeless > 0 || s.sick > 5 ? COLORS.warn : COLORS.dim);
        this.bar(p, 300, 114, 190, 28, '盼望', s.hope, COLORS.good, s.hope < 20);
        this.bar(p, 506, 114, 200, 28, '躁动', s.unrest, COLORS.bad, s.unrest > 80);

        // 第四行：事件横幅
        const [text, color] = this.bannerText();
        p.fillRect(12, 152, w - 24, 34, withAlpha(color, 0.22), 10);
        p.text(text, w / 2, 169, 19, color, 'center', true);
    }

    private bar(p: Painter, x: number, y: number, w: number, h: number, label: string, v: number, color: string, alarm: boolean): void {
        p.fillRect(x, y, w, h, '#00000066', 8);
        const fw = Math.max(0, (w * v) / 100);
        const flash = alarm && Math.sin(this.time * 8) > 0;
        if (fw > 2) p.fillRect(x, y, fw, h, flash ? '#ffffff' : color, 8);
        p.text(`${label} ${Math.round(v)}`, x + 10, y + h / 2, 17, '#ffffff', 'left', true);
    }

    private bannerText(): [string, string] {
        const g = this.game;
        const s = g.state;
        const ev = g.activeEvent();
        if (ev) return [`${ev.name}中！${ev.desc}`, COLORS.bad];
        const next = EVENTS.find(e => s.hour < e.start && s.hour >= e.start - e.warnHoursBefore);
        if (next) {
            const hrs = Math.ceil(next.start - s.hour);
            return [`预警：${next.name}将在 ${hrs} 小时后到来`, COLORS.warn];
        }
        if (s.towerBroken > 0) return [`心泉塔维修中，还需 ${s.towerBroken} 小时`, COLORS.bad];
        if (s.thirst > 0) return ['缺水！人们正在渴死', COLORS.bad];
        if (s.hunger > 0) return ['缺粮！人们正在挨饿', COLORS.bad];
        if (s.towerDamage >= TOWER.damageLimit - 3) return ['心泉塔过热，快降档！', COLORS.warn];
        if (s.homeless > 0) return [`${s.homeless} 人露宿在外，快建住所`, COLORS.warn];
        return [g.isNight() ? '夜晚寒冷：心泉塔为全城供暖' : '白天酷热：心泉塔喷洒水雾降温', COLORS.dim];
    }

    private drawBottom(p: Painter): void {
        const g = this.game;
        const s = g.state;
        const w = this.w;
        const top = this.h - this.bottomH;

        // 心泉塔档位
        p.fillRect(12, top, w - 24, 72, COLORS.panel, 14);
        p.text('心泉塔', 28, top + 24, 22, COLORS.text, 'left', true);
        p.text(`燃料 -${TOWER.fuelPerHour[s.towerPower]}/时`, 28, top + 52, 15, COLORS.dim);
        const lw = 116;
        TOWER.levelNames.forEach((name, i) => {
            const x = w - 24 - (4 - i) * (lw + 6);
            const on = s.towerPower === i;
            this.button(p, x, top + 10, lw, 52, name, () => this.report(g.setTowerPower(i)), {
                bg: on ? TOWER_COLORS[i] : COLORS.button, border: on ? '#ffffff' : undefined, size: 21, bold: on,
            });
        });

        // 信息面板
        const iy = top + 82;
        const ih = 150;
        p.fillRect(12, iy, w - 24, ih, COLORS.panelSoft, 14);
        if (this.tool) this.drawToolInfo(p, iy);
        else if (this.selected === 'tower') this.drawTowerInfo(p, iy);
        else if (this.selected && s.buildings[this.selected]) this.drawBuildingInfo(p, iy, this.selected);
        else this.drawLog(p, iy);

        if (!this.tool && g.canUseAd('rush')) {
            this.button(p, w - 200, iy + 10, 176, 40, `▶ ${ADS.rush.name}`, () => this.watchAd('rush', () => g.applyRush()), {
                bg: COLORS.ad, size: 18, bold: true,
            });
        }

        // 建造栏
        const by = iy + ih + 10;
        const bh = this.h - by - 12;
        const n = BUILD_ORDER.length;
        const bw = (w - 24 - (n - 1) * 8) / n;
        BUILD_ORDER.forEach((id, i) => {
            const def = BUILDINGS[id];
            const x = 12 + i * (bw + 8);
            const on = this.tool === id;
            const afford = s.res.parts >= def.cost;
            p.fillRect(x, by, bw, bh, on ? COLORS.buttonOn : COLORS.panel, 14);
            if (on) p.strokeRect(x, by, bw, bh, '#ffffff', 3, 14);
            p.fillCircle(x + bw / 2, by + bh * 0.3, bw * 0.28, on ? '#00000044' : '#ffffff22');
            p.text(def.glyph, x + bw / 2, by + bh * 0.3, 32, '#ffffff', 'center', true);
            p.text(def.name, x + bw / 2, by + bh * 0.64, 18, COLORS.text, 'center');
            p.text(`零件 ${def.cost}`, x + bw / 2, by + bh * 0.84, 15, afford ? COLORS.dim : COLORS.bad, 'center');
            this.hits.push({
                x, y: by, w: bw, h: bh, modal: false,
                fn: () => { this.tool = on ? null : id; this.selected = null; },
            });
        });
    }

    private drawToolInfo(p: Painter, y: number): void {
        const def = BUILDINGS[this.tool!];
        p.text(`建造：${def.name}（零件 ${def.cost}，${def.buildHours} 小时）`, 28, y + 28, 22, COLORS.text, 'left', true);
        p.text(def.desc, 28, y + 64, 18, COLORS.dim);
        const jobs = def.workers ? `需要工人 ${def.workers}。` : '';
        p.text(`${jobs}点击地图上的空地建造。越靠内圈越凉爽。`, 28, y + 96, 17, COLORS.dim);
        this.button(p, this.w - 140, y + 92, 112, 46, '取消', () => { this.tool = null; }, { size: 20 });
    }

    private drawTowerInfo(p: Painter, y: number): void {
        const s = this.game.state;
        const lvl = s.towerPower;
        p.text(`心泉塔 · ${TOWER.levelNames[lvl]}`, 28, y + 28, 22, COLORS.text, 'left', true);
        const cov = TOWER.coverage[lvl];
        p.text(`覆盖：${cov ? `第 1–${cov} 圈` : '无'}    抽水：+${TOWER.waterPerHour[lvl]}/时    燃料：-${TOWER.fuelPerHour[lvl]}/时`, 28, y + 62, 17, COLORS.dim);
        p.text(`井水深度：${Math.round(s.well)}%    超载损伤：${Math.floor(s.towerDamage)}/${TOWER.damageLimit}`, 28, y + 92, 17,
            s.towerDamage >= TOWER.damageLimit - 3 ? COLORS.warn : COLORS.dim);
        p.text('档位越高越凉爽、抽水越多，但更耗燃料、井水降得更快。', 28, y + 122, 16, COLORS.dim);
    }

    private drawBuildingInfo(p: Painter, y: number, id: string): void {
        const g = this.game;
        const b = g.state.buildings[id];
        const def = BUILDINGS[b.type];
        let status: string;
        if (!b.built) status = `建造中 ${Math.floor((b.progress / def.buildHours) * 100)}%`;
        else if (!b.enabled) status = '已停工';
        else if (def.workers > 0) status = `工人 ${b.workers}/${def.workers}`;
        else status = '使用中';
        p.text(`${def.name} · 第 ${b.ring} 圈 · ${status}`, 28, y + 28, 22, COLORS.text, 'left', true);
        p.text(def.desc, 28, y + 62, 17, COLORS.dim);
        p.text(`当前温度 ${Math.round(g.ringTemp(b.ring))}°`, 28, y + 92, 17, COLORS.dim);
        const bx = this.w - 24;
        this.button(p, bx - 112, y + 92, 104, 46, '拆除', () => { this.report(g.demolish(id)); this.selected = null; }, {
            size: 19, bg: '#6a2e24',
        });
        if (b.built && (def.workers > 0 || def.beds)) {
            this.button(p, bx - 228, y + 92, 104, 46, b.enabled ? '停工' : '开工', () => this.report(g.toggle(id)), { size: 19 });
        }
    }

    private drawLog(p: Painter, y: number): void {
        const log = this.game.state.log.slice(-4);
        log.forEach((l, i) => {
            const d = Math.floor(l.hour / 24) + 1;
            const hh = Math.floor(l.hour % 24);
            p.text(`D${d} ${pad2(hh)}:00`, 28, y + 26 + i * 33, 15, '#8c7d66');
            p.text(l.text.length > 24 ? l.text.slice(0, 23) + '…' : l.text, 124, y + 26 + i * 33, 18, LOG_COLORS[l.level]);
        });
    }

    private drawToast(p: Painter, text: string): void {
        const w = Math.min(this.w - 60, text.length * 24 + 60);
        const y = this.geom.cy + this.geom.unit * 2.2;
        p.fillRect((this.w - w) / 2, y - 28, w, 56, '#000000dd', 28);
        p.text(text, this.w / 2, y, 22, '#ffffff', 'center');
    }

    private drawModal(p: Painter, m: Modal): void {
        p.fillRect(0, 0, this.w, this.h, '#000000aa');
        const cw = this.w - 80;
        const lines = wrapText(m.text, cw - 60, 22);
        const ch = 100 + lines.length * 34 + m.buttons.length * 76 + 20;
        const cx = 40;
        const cy = (this.h - ch) / 2;
        p.fillRect(cx, cy, cw, ch, '#2a2018', 22);
        p.strokeRect(cx, cy, cw, ch, COLORS.accent, 2, 22);
        p.text(m.title, this.w / 2, cy + 48, 32, COLORS.accent, 'center', true);
        lines.forEach((l, i) => p.text(l, cx + 30, cy + 100 + i * 34, 22, COLORS.text));
        let by = cy + 100 + lines.length * 34 + 10;
        for (const b of m.buttons) {
            this.button(p, cx + 30, by, cw - 60, 62, b.label, b.fn, { bg: b.color, size: 22, bold: true, modal: true });
            by += 76;
        }
    }
}
