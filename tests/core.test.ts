import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, RING_COUNT, RING_SECTORS, RULES, TOWER } from '../client/assets/scripts/core/config';
import { Game, createState } from '../client/assets/scripts/core/game';
import { hitTest, sectorCenter } from '../client/assets/scripts/ui/layout';
import { runOne } from '../tools/simulate';

test('开局状态', () => {
    const g = new Game(createState(1));
    assert.equal(g.population, RULES.start.workers + RULES.start.children);
    assert.equal(g.day, 1);
    assert.equal(g.housingCapacity(), 20);
    assert.ok(g.state.log.length > 0, '开局应有引导日志');
});

test('建造：扣零件、按时完工、不能重复建造', () => {
    const g = new Game(createState(1));
    const parts = g.state.res.parts;
    assert.ok(g.build('farm', 3, 0).ok);
    assert.equal(g.state.res.parts, parts - BUILDINGS.farm.cost);
    assert.equal(g.build('shelter', 3, 0).ok, false);
    assert.equal(g.build('farm', 9, 0).ok, false);
    g.tick(BUILDINGS.farm.buildHours);
    assert.ok(g.state.buildings['3-0'].built);
});

test('零件不足时不能建造', () => {
    const g = new Game(createState(1));
    g.state.res.parts = 3;
    const r = g.build('clinic', 2, 0);
    assert.equal(r.ok, false);
    assert.match(r.reason!, /零件不足/);
});

test('温度：开塔时内圈比外圈舒适，关塔时各圈相同', () => {
    const g = new Game(createState(1));
    const noon = 12;
    g.setTowerPower(2);
    assert.ok(g.ringTemp(1, noon) < g.ringTemp(3, noon));
    assert.equal(g.ringTemp(RING_COUNT, noon), g.ambientTemp(noon));
    g.setTowerPower(0);
    assert.equal(g.ringTemp(1, noon, 0), g.ringTemp(5, noon, 0));
    // 夜里塔是供暖
    assert.ok(g.ringTemp(1, 26, 2) > g.ambientTemp(26));
});

test('燃料耗尽后心泉塔熄火', () => {
    const g = new Game(createState(1));
    g.state.res.fuel = 2;
    g.setTowerPower(2);
    g.tick(2);
    assert.equal(g.state.effPower, 0);
});

test('超载太久会损坏，维修期间不能调档', () => {
    const g = new Game(createState(1));
    g.state.res.fuel = 9999;
    g.setTowerPower(3);
    g.tick(TOWER.damageLimit);
    assert.equal(g.state.towerBroken, TOWER.brokenHours);
    assert.equal(g.setTowerPower(1).ok, false);
    g.tick(TOWER.brokenHours);
    assert.ok(g.setTowerPower(1).ok);
});

test('相同种子结果完全一致（可复现）', () => {
    const a = runOne(42, 'smart');
    const b = runOne(42, 'smart');
    assert.deepEqual(a.s, b.s);
});

test('什么都不做会失败；最后的希望可回档且每局只能一次', () => {
    const g = new Game(createState(7));
    let guard = 0;
    while (g.state.status === 'playing' && guard++ < 2000) g.tick(1);
    assert.equal(g.state.status, 'lost');
    const prompt = g.takePrompt();
    assert.equal(prompt?.kind, 'gameover');
    assert.ok(g.canUseAd('revive'));
    const day = g.day;
    assert.ok(g.applyRevive().ok);
    assert.equal(g.state.status, 'playing');
    assert.equal(g.hourOfDay, 0);
    assert.equal(g.day, day);
    assert.equal(g.state.adUses.revive, 1);
    while (g.state.status === 'playing' && guard++ < 4000) g.tick(1);
    assert.equal(g.canUseAd('revive'), false);
});

test('商队广告有次数上限，全员加班每天一次', () => {
    const g = new Game(createState(3));
    assert.ok(g.applyCaravan().ok);
    assert.ok(g.applyCaravan().ok);
    assert.equal(g.applyCaravan().ok, false);
    assert.equal(g.canUseAd('rush'), false, '没有在建建筑时不能用');
    g.build('farm', 3, 1);
    assert.ok(g.applyRush().ok);
    assert.ok(g.state.buildings['3-1'].built);
    g.build('farm', 3, 2);
    assert.equal(g.applyRush().ok, false, '同一天不能再用');
});

test('胜利条件：撑到最后一天', () => {
    let won = 0;
    for (let i = 0; i < 20; i++) if (runOne(100 + i, 'smart', 2).won) won++;
    assert.ok(won >= 18, `带广告的 AI 应该基本能赢，实际 ${won}/20`);
});

test('地图点击：每个地块中心都能命中自己', () => {
    const geom = { cx: 360, cy: 600, unit: 50 };
    assert.deepEqual(hitTest(geom, 360, 600), { kind: 'tower' });
    for (let r = 1; r <= RING_COUNT; r++) {
        for (let s = 0; s < RING_SECTORS[r - 1]; s++) {
            const [x, y] = sectorCenter(geom, r, s);
            assert.deepEqual(hitTest(geom, x, y), { kind: 'plot', ring: r, sector: s });
        }
    }
    assert.equal(hitTest(geom, 0, 0), null);
});
