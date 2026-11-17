/**
 * 无界面自动模拟：用一个简单的 AI 策略跑很多局，统计存活率，用来调难度。
 * 用法：npm run sim -- [局数] [策略]
 *   策略：smart（会建造、会调塔）| idle（什么都不做）
 */
import { BuildingId, CLIMATE, RULES, TOWER } from '../client/assets/scripts/core/config';
import { Game, createState, discomfort } from '../client/assets/scripts/core/game';

type Step = [BuildingId, number, number];
const PLAN: Step[] = [
    ['salvage', 5, 0], ['gatherer', 5, 3], ['farm', 3, 0], ['shelter', 1, 1], ['shelter', 1, 2],
    ['condenser', 2, 0], ['farm', 3, 3], ['shelter', 1, 4], ['shelter', 1, 5], ['farm', 3, 6],
    ['clinic', 2, 2], ['shelter', 2, 4], ['shelter', 2, 6], ['condenser', 2, 8],
];

function pickPower(g: Game): number {
    const h = g.state.hour + 0.5;
    const canOverload = g.state.towerDamage < TOWER.damageLimit - 4;
    for (let lvl = 2; lvl <= 3; lvl++) {
        if (lvl === 3 && !canOverload) return 2;
        if (discomfort(g.ringTemp(2, h, lvl)) === 0) return lvl;
    }
    return canOverload ? 3 : 2;
}

export function runOne(seed: number, strategy: string, caravans = 0) {
    const g = new Game(createState(seed));
    let planIdx = 0;
    while (g.state.status === 'playing') {
        if (strategy === 'smart') {
            while (planIdx < PLAN.length) {
                const [t, r, sct] = PLAN[planIdx];
                if (!g.build(t, r, sct).ok) break;
                planIdx++;
            }
            g.setTowerPower(pickPower(g));
            let p;
            while ((p = g.takePrompt())) {
                if (p.kind === 'warning' && caravans > 0 && g.canUseAd('caravan')) { g.applyCaravan(); caravans--; }
            }
        }
        g.tick(1);
    }
    return { won: g.state.status === 'won', day: g.day, pop: g.population, deaths: g.state.deaths, s: g.state };
}

if (require.main === module) {
    const n = Number(process.argv[2] ?? 200);
    const strategy = process.argv[3] ?? 'smart';
    for (const caravans of strategy === 'smart' ? [0, 2] : [0]) {
        let wins = 0; const days: number[] = []; let deaths = 0;
        for (let i = 0; i < n; i++) {
            const r = runOne(1000 + i, strategy, caravans);
            if (r.won) wins++;
            days.push(r.day); deaths += r.deaths;
        }
        days.sort((a, b) => a - b);
        console.log(`策略=${strategy} 商队广告=${caravans} 局数=${n} 胜率=${(wins / n * 100).toFixed(0)}% ` +
            `失败中位天数=${days[Math.floor(n / 2)]} 平均死亡=${(deaths / n).toFixed(1)}`);
    }
    const sample = runOne(1000, strategy);
    console.log('样例局最后日志：'); for (const l of sample.s.log.slice(-8)) console.log(`  [D${Math.floor(l.hour / 24) + 1} ${Math.floor(l.hour % 24)}:00] ${l.text}`);
    console.log('样例局资源：', Object.fromEntries(Object.entries(sample.s.res).map(([k, v]) => [k, Math.round(v)])),
        `盼望=${sample.s.hope.toFixed(0)} 躁动=${sample.s.unrest.toFixed(0)} 井=${sample.s.well.toFixed(0)} 人口=${sample.pop}`);
    void CLIMATE; void RULES;
}
