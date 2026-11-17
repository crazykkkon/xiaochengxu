/**
 * 核心模拟：资源、温度、人口、民心、建造、事件。
 * 不依赖任何引擎，状态全部是可 JSON 序列化的纯数据（方便存档和「最后的希望」回档）。
 */
import {
    ADS, AdPlacement, BUILDINGS, BuildingId, CARAVAN_REWARD, CLIMATE, EVENTS, EventId,
    OUTER_BONUS, RESOURCE_NAMES, REVIVE_REWARD, RING_COUNT, RING_SECTORS, RULES, ResourceId,
    ScriptedEvent, TOWER,
} from './config';
import { nextRandom } from './rng';

export interface Building {
    type: BuildingId;
    ring: number;
    sector: number;
    /** 已建造小时数 */
    progress: number;
    built: boolean;
    enabled: boolean;
    /** 当前分配到的工人数 */
    workers: number;
    /** 建造顺序，决定工人分配优先级 */
    order: number;
}

export type LogLevel = 'info' | 'good' | 'warn' | 'bad';

export interface LogEntry { hour: number; text: string; level: LogLevel }

export type Prompt =
    | { kind: 'warning'; eventId: EventId; title: string; text: string }
    | { kind: 'gameover'; title: string; text: string; canRevive: boolean }
    | { kind: 'victory'; title: string; text: string };

export interface GameState {
    version: 1;
    rng: number;
    /** 游戏总小时数（从第 1 天 0 点开始，可为小数） */
    hour: number;
    res: Record<ResourceId, number>;
    /** 健康的成年劳动力 */
    workers: number;
    sick: number;
    children: number;
    deaths: number;
    hope: number;
    unrest: number;
    well: number;
    towerPower: number;
    /** 本小时实际生效的档位（缺燃料/损坏时为 0） */
    effPower: number;
    towerDamage: number;
    towerBroken: number;
    thirst: number;
    hunger: number;
    homeless: number;
    buildings: Record<string, Building>;
    nextOrder: number;
    warned: EventId[];
    finishedEvents: EventId[];
    adUses: Record<AdPlacement, number>;
    lastRushDay: number;
    status: 'playing' | 'won' | 'lost';
    log: LogEntry[];
    prompts: Prompt[];
}

export interface ActionResult { ok: boolean; reason?: string }

export const plotId = (ring: number, sector: number) => `${ring}-${sector}`;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** 温度偏离舒适区的程度（0 = 舒适） */
export function discomfort(temp: number): number {
    return Math.max(0, temp - CLIMATE.comfortMax) / 8 + Math.max(0, CLIMATE.comfortMin - temp) / 8;
}

export function createState(seed = 20261117): GameState {
    const s = RULES.start;
    const state: GameState = {
        version: 1,
        rng: seed >>> 0,
        hour: RULES.startHour,
        res: { ...s.resources },
        workers: s.workers,
        sick: 0,
        children: s.children,
        deaths: 0,
        hope: s.hope,
        unrest: s.unrest,
        well: s.well,
        towerPower: s.towerPower,
        effPower: s.towerPower,
        towerDamage: 0,
        towerBroken: 0,
        thirst: 0,
        hunger: 0,
        homeless: 0,
        buildings: {},
        nextOrder: 0,
        warned: [],
        finishedEvents: [],
        adUses: { revive: 0, caravan: 0, rush: 0 },
        lastRushDay: 0,
        status: 'playing',
        log: [],
        prompts: [],
    };
    // 开局送两座住所，在第 1 圈
    for (const sector of [0, 3]) {
        state.buildings[plotId(1, sector)] = {
            type: 'shelter', ring: 1, sector, progress: BUILDINGS.shelter.buildHours,
            built: true, enabled: true, workers: 0, order: state.nextOrder++,
        };
    }
    return state;
}

export class Game {
    state: GameState;
    /** 每天 0 点的存档，用于「最后的希望」回档 */
    private dayStartSnapshot: string | null = null;

    constructor(state?: GameState) {
        this.state = state ?? createState();
        this.dayStartSnapshot = JSON.stringify(this.state);
        if (this.state.log.length === 0) {
            this.log('大旱第一百年。你们找到了古井，建起了心泉塔。', 'info');
            this.log('点击底部建筑，再点击空地建造。', 'info');
        }
    }

    // ---------------------------------------------------------------- 查询

    get day(): number { return Math.floor(this.state.hour / 24) + 1; }
    get hourOfDay(): number { return this.state.hour % 24; }
    get population(): number { return this.state.workers + this.state.sick + this.state.children; }

    isNight(hourOfDay = this.hourOfDay): boolean {
        return hourOfDay >= RULES.nightStart || hourOfDay < RULES.nightEnd;
    }

    activeEvent(hour = this.state.hour): ScriptedEvent | null {
        return EVENTS.find(e => hour >= e.start && hour < e.end) ?? null;
    }

    ambientTemp(hour = this.state.hour): number {
        const h = hour % 24;
        const ev = this.activeEvent(hour);
        return CLIMATE.mid + CLIMATE.amp * Math.cos((2 * Math.PI * (h - CLIMATE.peakHour)) / 24) + (ev?.tempDelta ?? 0);
    }

    /** 第 ring 圈的温度；ring = RING_COUNT+1 表示城外 */
    ringTemp(ring: number, hour = this.state.hour, power = this.state.effPower): number {
        const amb = this.ambientTemp(hour);
        const cov = TOWER.coverage[power];
        const f = ring <= cov ? TOWER.pull[power] * (1 - (ring - 1) * 0.12) : 0;
        return amb + (TOWER.targetTemp - amb) * f;
    }

    housingCapacity(): number {
        let cap = 0;
        for (const b of Object.values(this.state.buildings)) {
            if (b.built) cap += BUILDINGS[b.type].housing ?? 0;
        }
        return cap;
    }

    bedCount(): number {
        let beds = 0;
        for (const b of Object.values(this.state.buildings)) {
            if (b.built && b.enabled && b.workers > 0) beds += BUILDINGS[b.type].beds ?? 0;
        }
        return beds;
    }

    /** 当前各工作岗位的需求总数 */
    jobsTotal(): number {
        let jobs = 0;
        for (const b of Object.values(this.state.buildings)) {
            if (b.built && b.enabled) jobs += BUILDINGS[b.type].workers;
        }
        return jobs;
    }

    canUseAd(p: AdPlacement): boolean {
        const s = this.state;
        if (s.adUses[p] >= ADS[p].maxPerGame) return false;
        if (p === 'rush') {
            return s.status === 'playing' && s.lastRushDay !== this.day
                && Object.values(s.buildings).some(b => !b.built);
        }
        if (p === 'revive') return s.status === 'lost' && this.dayStartSnapshot !== null;
        return s.status === 'playing';
    }

    // ---------------------------------------------------------------- 玩家操作

    build(type: BuildingId, ring: number, sector: number): ActionResult {
        const s = this.state;
        if (s.status !== 'playing') return { ok: false, reason: '游戏已结束' };
        if (ring < 1 || ring > RING_COUNT || sector < 0 || sector >= RING_SECTORS[ring - 1]) {
            return { ok: false, reason: '无效地块' };
        }
        const id = plotId(ring, sector);
        if (s.buildings[id]) return { ok: false, reason: '这里已经有建筑了' };
        const def = BUILDINGS[type];
        if (s.res.parts < def.cost) return { ok: false, reason: `零件不足（需要 ${def.cost}）` };
        s.res.parts -= def.cost;
        s.buildings[id] = {
            type, ring, sector, progress: 0, built: false, enabled: true, workers: 0, order: s.nextOrder++,
        };
        return { ok: true };
    }

    toggle(id: string): ActionResult {
        const b = this.state.buildings[id];
        if (!b) return { ok: false, reason: '没有建筑' };
        b.enabled = !b.enabled;
        this.assignWorkers();
        return { ok: true };
    }

    demolish(id: string): ActionResult {
        const b = this.state.buildings[id];
        if (!b) return { ok: false, reason: '没有建筑' };
        const def = BUILDINGS[b.type];
        const refund = b.built ? Math.floor(def.cost / 2) : def.cost;
        this.state.res.parts += refund;
        delete this.state.buildings[id];
        this.assignWorkers();
        this.log(`拆除了${def.name}，回收零件 ${refund}`, 'info');
        return { ok: true };
    }

    setTowerPower(level: number): ActionResult {
        const s = this.state;
        if (level < 0 || level >= TOWER.levelNames.length) return { ok: false, reason: '无效档位' };
        if (s.towerBroken > 0) return { ok: false, reason: `心泉塔维修中（还需 ${s.towerBroken} 小时）` };
        s.towerPower = level;
        s.effPower = s.res.fuel >= TOWER.fuelPerHour[level] ? level : 0;
        return { ok: true };
    }

    /** 看完广告后调用：商队来援 */
    applyCaravan(): ActionResult {
        if (!this.canUseAd('caravan')) return { ok: false, reason: '本局次数已用完' };
        this.state.adUses.caravan++;
        this.addResources(CARAVAN_REWARD);
        this.log('一支商队穿过沙海来到绿洲，带来了水和燃料！', 'good');
        return { ok: true };
    }

    /** 看完广告后调用：全员加班，立即完成所有在建建筑（每天 1 次） */
    applyRush(): ActionResult {
        if (!this.canUseAd('rush')) return { ok: false, reason: '今天已经用过了' };
        const s = this.state;
        s.adUses.rush++;
        s.lastRushDay = this.day;
        for (const b of Object.values(s.buildings)) {
            if (!b.built) { b.built = true; b.progress = BUILDINGS[b.type].buildHours; }
        }
        this.assignWorkers();
        this.log('全员通宵加班，所有在建建筑立即完工！', 'good');
        return { ok: true };
    }

    /** 看完广告后调用：最后的希望，回到当天开始并获得补给 */
    applyRevive(): ActionResult {
        if (!this.canUseAd('revive') || !this.dayStartSnapshot) return { ok: false, reason: '无法回档' };
        const uses = { ...this.state.adUses, revive: this.state.adUses.revive + 1 };
        this.state = JSON.parse(this.dayStartSnapshot) as GameState;
        const s = this.state;
        s.adUses = uses;
        s.hope = Math.max(s.hope, 35);
        s.unrest = Math.min(s.unrest, 60);
        s.prompts = [];
        this.addResources(REVIVE_REWARD);
        this.log('最后的希望：时间回到今天黎明，远方送来了一批补给。', 'good');
        return { ok: true };
    }

    /** UI 取走待处理的弹窗 */
    takePrompt(): Prompt | undefined {
        return this.state.prompts.shift();
    }

    // ---------------------------------------------------------------- 时间推进

    /** 推进游戏时间（单位：游戏小时），整点时结算 */
    tick(dtHours: number): void {
        const s = this.state;
        if (s.status !== 'playing' || dtHours <= 0) return;
        const target = s.hour + dtHours;
        while (Math.floor(s.hour) + 1 <= target && s.status === 'playing') {
            s.hour = Math.floor(s.hour) + 1;
            this.simulateHour();
        }
        if (s.status === 'playing') s.hour = target;
    }

    private simulateHour(): void {
        const s = this.state;
        const endHour = s.hour; // 刚刚结束的这一小时是 [endHour-1, endHour)
        const midHour = endHour - 0.5;
        const hod = (endHour - 1) % 24;
        const ev = this.activeEvent(midHour);

        // 1. 心泉塔
        let power = s.towerPower;
        if (s.towerBroken > 0) {
            power = 0;
            s.towerBroken--;
            if (s.towerBroken === 0) this.log('心泉塔修好了，重新启动。', 'good');
        } else if (power > 0 && s.res.fuel < TOWER.fuelPerHour[power]) {
            power = 0;
            if (s.effPower > 0) this.log('燃料耗尽，心泉塔熄火了！', 'bad');
        }
        s.effPower = power;
        s.res.fuel -= TOWER.fuelPerHour[power];
        if (power === 3) {
            s.towerDamage += TOWER.overloadDamagePerHour;
            if (s.towerDamage >= TOWER.damageLimit) {
                s.towerDamage = 0;
                s.towerBroken = TOWER.brokenHours;
                s.towerPower = 0;
                s.effPower = 0;
                this.log(`心泉塔超载过久，损坏了！需要维修 ${TOWER.brokenHours} 小时。`, 'bad');
            } else if (s.towerDamage === TOWER.damageLimit - 3) {
                this.log('警告：心泉塔超载过热，再撑 3 小时就会损坏！', 'warn');
            }
        } else {
            s.towerDamage = Math.max(0, s.towerDamage - TOWER.damageRecoverPerHour);
        }
        const wellFactor = s.well >= 40 ? 1 : 0.5 + s.well / 80;
        s.res.water += TOWER.waterPerHour[s.effPower] * wellFactor;
        s.well = Math.max(0, s.well - TOWER.wellDropPerHour[s.effPower]);

        const temps: number[] = [];
        for (let r = 1; r <= RING_COUNT + 1; r++) temps[r] = this.ringTemp(r, midHour, s.effPower);

        // 2. 分配工人并生产
        this.assignWorkers();
        const dayShift = hod >= RULES.workStart && hod < RULES.workEnd;
        const nightShift = this.isNight(hod);
        const working: Building[] = [];
        for (const b of this.sortedBuildings()) {
            if (!b.built || !b.enabled || b.workers === 0) continue;
            const def = BUILDINGS[b.type];
            if (!def.produce) continue;
            if (def.nightShift ? !nightShift : !dayShift) continue;
            if (def.outdoor && ev?.outdoorStopped) continue;
            working.push(b);
            const eff = clamp(1 - discomfort(temps[b.ring]) * 0.5, 0.3, 1);
            let mul = b.workers * eff;
            if (def.outdoor) mul *= 1 + OUTER_BONUS * (b.ring - 1);
            if (b.type === 'condenser' && ev) mul *= ev.condenserMul;
            // 消耗不足时按比例减产
            if (def.consume) {
                for (const [k, v] of Object.entries(def.consume) as [ResourceId, number][]) {
                    const need = v * mul;
                    if (need > 0 && s.res[k] < need) mul *= s.res[k] / need;
                }
                for (const [k, v] of Object.entries(def.consume) as [ResourceId, number][]) s.res[k] -= v * mul;
            }
            for (const [k, v] of Object.entries(def.produce) as [ResourceId, number][]) s.res[k] += v * mul;
        }

        // 3. 吃喝
        const pop = this.population;
        const waterNeed = (pop * RULES.waterPerPersonPerDay) / 24;
        const foodNeed = (pop * RULES.foodPerPersonPerDay) / 24;
        const wasThirsty = s.thirst > 0;
        const wasHungry = s.hunger > 0;
        if (s.res.water >= waterNeed) { s.res.water -= waterNeed; s.thirst = Math.max(0, s.thirst - 0.1); }
        else { s.res.water = 0; s.thirst = Math.min(1, s.thirst + 0.06); }
        if (s.res.food >= foodNeed) { s.res.food -= foodNeed; s.hunger = Math.max(0, s.hunger - 0.1); }
        else { s.res.food = 0; s.hunger = Math.min(1, s.hunger + 0.04); }
        if (!wasThirsty && s.thirst > 0) this.log('水喝光了！人们开始口渴。', 'bad');
        if (!wasHungry && s.hunger > 0) this.log('粮食吃光了！人们开始挨饿。', 'bad');

        // 4. 住房（内圈优先分配）
        const homes: { ring: number; cap: number }[] = [];
        for (const b of Object.values(s.buildings)) {
            if (b.built && BUILDINGS[b.type].housing) homes.push({ ring: b.ring, cap: BUILDINGS[b.type].housing! });
        }
        homes.sort((a, b) => a.ring - b.ring);

        // 5. 暴露在高温/低温下 → 生病
        const healthy = s.workers;
        const exposures: { count: number; ring: number }[] = [];
        let atWork = 0;
        for (const b of working) { exposures.push({ count: b.workers, ring: b.ring }); atWork += b.workers; }
        let left = healthy - atWork;
        for (const h of homes) {
            if (left <= 0) break;
            const n = Math.min(h.cap, left);
            exposures.push({ count: n, ring: h.ring });
            left -= n;
        }
        s.homeless = Math.max(0, pop - this.housingCapacity());
        if (left > 0) exposures.push({ count: left, ring: RING_COUNT + 1 });

        let newSick = 0;
        const thirstRisk = s.thirst > 0.3 ? 0.02 : 0;
        const hungerRisk = s.hunger > 0.3 ? 0.01 : 0;
        for (const e of exposures) {
            const d = discomfort(temps[e.ring]);
            const p = 0.008 * d + 0.012 * d * d + thirstRisk + hungerRisk;
            newSick += this.binomial(e.count, p);
        }
        newSick = Math.min(newSick, s.workers);
        s.workers -= newSick;
        s.sick += newSick;
        if (newSick >= 3) this.log(`${newSick} 人中暑或冻伤病倒了。`, 'warn');

        // 6. 病人：康复或死亡
        const beds = this.bedCount();
        const bedded = Math.min(beds, s.sick);
        const unbedded = s.sick - bedded;
        const severe = s.thirst > 0.5 || s.hunger > 0.5 ? 0.01 : 0;
        const recovered = this.binomial(bedded, 0.1) + this.binomial(unbedded, 0.03);
        const sickDeaths = this.binomial(bedded, 0.002 + severe) + this.binomial(unbedded, 0.008 + severe);
        const realDeaths = Math.min(sickDeaths, s.sick);
        s.sick -= realDeaths;
        const realRecovered = Math.min(recovered, s.sick);
        s.sick -= realRecovered;
        s.workers += realRecovered;

        // 极度饥渴：所有人都有死亡风险
        let otherDeaths = 0;
        if (s.thirst > 0.6 || s.hunger > 0.6) {
            const p = 0.004 * (s.thirst > 0.6 ? 1 : 0) + 0.003 * (s.hunger > 0.6 ? 1 : 0);
            const dw = this.binomial(s.workers, p);
            const dc = this.binomial(s.children, p);
            s.workers -= dw;
            s.children -= dc;
            otherDeaths = dw + dc;
        }
        const deaths = realDeaths + otherDeaths;
        if (deaths > 0) {
            s.deaths += deaths;
            this.log(`${deaths} 人死去了。`, 'bad');
        }

        // 7. 民心
        let dHope = 0.05;
        let dUnrest = -0.05;
        if (s.thirst > 0) { dHope -= 0.4; dUnrest += 0.6; }
        if (s.hunger > 0) { dHope -= 0.3; dUnrest += 0.5; }
        if (pop > 0) {
            dUnrest += 0.4 * (s.homeless / pop);
            const sickRatio = s.sick / pop;
            if (sickRatio > 0.15) dHope -= 0.6 * sickRatio;
        }
        dHope -= 2 * deaths;
        dUnrest += 1 * deaths;
        s.hope = clamp(s.hope + dHope, 0, 100);
        s.unrest = clamp(s.unrest + dUnrest, 0, 100);

        // 8. 建造进度（沙暴时停工）
        for (const b of this.sortedBuildings()) {
            if (b.built) continue;
            if (ev?.outdoorStopped) continue;
            b.progress++;
            if (b.progress >= BUILDINGS[b.type].buildHours) {
                b.built = true;
                this.log(`${BUILDINGS[b.type].name}建好了。`, 'good');
            }
        }

        // 9. 剧本事件
        for (const e of EVENTS) {
            if (!s.warned.includes(e.id) && endHour >= e.start - e.warnHoursBefore) {
                s.warned.push(e.id);
                this.log(`预警：${e.name}将在 ${e.warnHoursBefore} 小时后到来！`, 'warn');
                s.prompts.push({
                    kind: 'warning', eventId: e.id, title: `${e.name}预警`,
                    text: `${e.name}将在 ${e.warnHoursBefore} 小时后到来。\n${e.desc}。\n赶快储备物资！`,
                });
            }
            if (endHour === e.start) this.log(`${e.name}来了！${e.desc}。`, 'bad');
            if (!s.finishedEvents.includes(e.id) && endHour >= e.end) {
                s.finishedEvents.push(e.id);
                s.hope = clamp(s.hope + 8, 0, 100);
                this.log(`${e.name}过去了，我们挺住了！（盼望 +8）`, 'good');
            }
        }

        // 10. 胜负判定
        if (this.population <= 0) return this.lose('所有人都死去了。绿洲重新归于沉寂。');
        if (s.hope <= 0) return this.lose('人们失去了最后的盼望，纷纷离开绿洲，走进了沙海。');
        if (s.unrest >= 100) return this.lose('愤怒的人群冲进了心泉塔，你被流放到了沙漠里。');
        if (endHour >= RULES.winDay * 24) {
            s.status = 'won';
            s.prompts.push({
                kind: 'victory', title: '绿洲存续',
                text: `你带领绿洲撑过了 ${RULES.winDay} 天。\n存活 ${this.population} 人，死亡 ${s.deaths} 人。`,
            });
            return;
        }

        // 11. 新的一天：记录回档点
        if (endHour % 24 === 0) {
            this.log(`第 ${this.day} 天`, 'info');
            this.dayStartSnapshot = JSON.stringify(s);
        }
    }

    // ---------------------------------------------------------------- 内部工具

    private lose(text: string): void {
        const s = this.state;
        s.status = 'lost';
        this.log(text, 'bad');
        s.prompts.push({ kind: 'gameover', title: '绿洲陷落', text, canRevive: this.canUseAd('revive') });
    }

    private sortedBuildings(): Building[] {
        return Object.values(this.state.buildings).sort((a, b) => a.order - b.order);
    }

    /** 按建造顺序把健康劳动力分配到各个岗位 */
    assignWorkers(): void {
        let free = this.state.workers;
        for (const b of this.sortedBuildings()) {
            const need = b.built && b.enabled ? BUILDINGS[b.type].workers : 0;
            b.workers = Math.min(need, free);
            free -= b.workers;
        }
    }

    private addResources(r: Partial<Record<ResourceId, number>>): void {
        for (const [k, v] of Object.entries(r) as [ResourceId, number][]) this.state.res[k] += v;
        const parts = (Object.entries(r) as [ResourceId, number][]).map(([k, v]) => `${RESOURCE_NAMES[k]} +${v}`);
        this.log(`获得：${parts.join('，')}`, 'good');
    }

    private random(): number {
        const [v, next] = nextRandom(this.state.rng);
        this.state.rng = next;
        return v;
    }

    private binomial(n: number, p: number): number {
        if (n <= 0 || p <= 0) return 0;
        let k = 0;
        for (let i = 0; i < n; i++) if (this.random() < p) k++;
        return k;
    }

    log(text: string, level: LogLevel = 'info'): void {
        this.state.log.push({ hour: this.state.hour, text, level });
        if (this.state.log.length > 40) this.state.log.shift();
    }
}
