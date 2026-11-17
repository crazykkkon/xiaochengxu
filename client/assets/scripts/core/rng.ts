/** 可存档的确定性随机数（mulberry32）。返回 [0,1) 的随机数和新的种子状态。 */
export function nextRandom(state: number): [number, number] {
    const next = (state + 0x6d2b79f5) >>> 0;
    let t = next;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}
