/**
 * 游戏数值配置。
 * 这里只放数据，不放逻辑，调数值只需要改这个文件。
 * 注意：core 目录下的代码不能 import 'cc'，要保证可以脱离引擎运行和测试。
 */

export type ResourceId = 'water' | 'food' | 'fuel' | 'parts';

export const RESOURCE_NAMES: Record<ResourceId, string> = {
    water: '水',
    food: '粮食',
    fuel: '燃料',
    parts: '零件',
};

export type BuildingId = 'shelter' | 'condenser' | 'farm' | 'gatherer' | 'salvage' | 'clinic';

export interface BuildingDef {
    id: BuildingId;
    name: string;
    /** 地图上显示的单字 */
    glyph: string;
    desc: string;
    cost: number; // 零件
    buildHours: number;
    workers: number;
    housing?: number;
    beds?: number;
    /** 每名工人每小时的产出 */
    produce?: Partial<Record<ResourceId, number>>;
    /** 每名工人每小时的消耗 */
    consume?: Partial<Record<ResourceId, number>>;
    /** 户外建筑：沙暴时停工，越往外圈产出越高 */
    outdoor?: boolean;
    /** 夜班建筑（冷凝器只在夜里工作） */
    nightShift?: boolean;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
    shelter: {
        id: 'shelter', name: '住所', glyph: '住', desc: '可住 10 人，越靠内圈越舒适',
        cost: 10, buildHours: 3, workers: 0, housing: 10,
    },
    condenser: {
        id: 'condenser', name: '冷凝器', glyph: '凝', desc: '夜间收集露水（只在夜里工作）',
        cost: 15, buildHours: 4, workers: 5, produce: { water: 1.2 }, nightShift: true,
    },
    farm: {
        id: 'farm', name: '沙地农场', glyph: '农', desc: '种植耐旱作物，需要消耗水',
        cost: 20, buildHours: 6, workers: 10, produce: { food: 0.5 }, consume: { water: 0.15 },
    },
    gatherer: {
        id: 'gatherer', name: '拾柴站', glyph: '柴', desc: '收集枯木和油页岩，越外圈产量越高',
        cost: 10, buildHours: 3, workers: 10, produce: { fuel: 0.45 }, outdoor: true,
    },
    salvage: {
        id: 'salvage', name: '拆解站', glyph: '拆', desc: '拆解废墟获得零件，越外圈产量越高',
        cost: 5, buildHours: 3, workers: 10, produce: { parts: 0.2 }, outdoor: true,
    },
    clinic: {
        id: 'clinic', name: '医馆', glyph: '医', desc: '5 张病床，病人康复更快、更少死亡',
        cost: 25, buildHours: 6, workers: 5, beds: 5,
    },
};

export const BUILD_ORDER: BuildingId[] = ['shelter', 'condenser', 'farm', 'gatherer', 'salvage', 'clinic'];

/** 环形地图：每一圈有多少个扇区地块（由内到外，共 5 圈） */
export const RING_SECTORS = [6, 9, 12, 15, 18];
export const RING_COUNT = RING_SECTORS.length;

/** 户外建筑的外圈加成：第 r 圈产出 × (1 + OUTER_BONUS × (r-1)) */
export const OUTER_BONUS = 0.12;

export const TOWER = {
    /** 档位名称：关闭 / 低 / 标准 / 超载 */
    levelNames: ['关闭', '低', '标准', '超载'],
    /** 每档覆盖到第几圈 */
    coverage: [0, 2, 3, 4],
    /** 每档把温度拉向舒适温度的强度（0~1） */
    pull: [0, 0.5, 0.7, 0.9],
    /** 每档每小时燃料消耗 */
    fuelPerHour: [0, 1, 2, 4],
    /** 每档每小时抽水量 */
    waterPerHour: [0, 5, 10, 13],
    /** 每档每小时井水下降 */
    wellDropPerHour: [0, 0.08, 0.15, 0.3],
    /** 超载每小时累积损伤；到达上限后损坏 */
    overloadDamagePerHour: 1,
    damageRecoverPerHour: 0.5,
    damageLimit: 10,
    brokenHours: 8,
    targetTemp: 24,
};

export const CLIMATE = {
    /** 气温 = mid + amp × cos(2π(h - peakHour)/24) */
    mid: 25,
    amp: 21,
    peakHour: 14,
    /** 舒适区间 */
    comfortMin: 14,
    comfortMax: 32,
};

export const RULES = {
    startHour: 6,
    /** 撑到第几天结束就胜利 */
    winDay: 12,
    workStart: 8,
    workEnd: 18,
    nightStart: 20,
    nightEnd: 6,
    waterPerPersonPerDay: 3,
    foodPerPersonPerDay: 1.4,
    start: {
        workers: 60,
        children: 20,
        resources: { water: 180, food: 160, fuel: 120, parts: 100 } as Record<ResourceId, number>,
        hope: 50,
        unrest: 10,
        towerPower: 1,
        well: 100,
    },
    /** 一游戏小时对应多少真实秒（1 倍速） */
    secondsPerHour: 5,
};

export type EventId = 'sandstorm' | 'heatwave';

export interface ScriptedEvent {
    id: EventId;
    name: string;
    /** 开始与结束（游戏总小时数，从第 1 天 0 点算起） */
    start: number;
    end: number;
    warnHoursBefore: number;
    tempDelta: number;
    outdoorStopped: boolean;
    condenserMul: number;
    desc: string;
}

const H = (day: number, hour: number) => (day - 1) * 24 + hour;

export const EVENTS: ScriptedEvent[] = [
    {
        id: 'sandstorm', name: '沙暴', start: H(6, 10), end: H(7, 8), warnHoursBefore: 24,
        tempDelta: 5, outdoorStopped: true, condenserMul: 0.3,
        desc: '户外建筑全部停工，冷凝器效率大降，气温升高',
    },
    {
        id: 'heatwave', name: '热浪', start: H(10, 6), end: H(12, 6), warnHoursBefore: 24,
        tempDelta: 9, outdoorStopped: false, condenserMul: 0.6,
        desc: '连续两天极端高温，中暑风险大增',
    },
];

/** 激励视频广告点位 */
export type AdPlacement = 'revive' | 'caravan' | 'rush';

export const ADS: Record<AdPlacement, { name: string; maxPerGame: number }> = {
    revive: { name: '最后的希望', maxPerGame: 1 },
    caravan: { name: '商队来援', maxPerGame: 2 },
    rush: { name: '全员加班', maxPerGame: 99 },
};

export const CARAVAN_REWARD: Partial<Record<ResourceId, number>> = { water: 80, fuel: 40 };
export const REVIVE_REWARD: Partial<Record<ResourceId, number>> = { water: 100, food: 80, fuel: 50 };
