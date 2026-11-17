/**
 * 激励视频广告适配层。
 * - 抖音小游戏：tt.createRewardedVideoAd
 * - 微信小游戏：wx.createRewardedVideoAd
 * - 其他环境（浏览器、编辑器预览）或未配置广告位：模拟广告，等待 1.5 秒后直接发放奖励
 *
 * 上线前把 AD_UNIT_IDS 里的占位符换成平台后台申请到的广告位 ID。
 */
import { AdPlacement } from '../core/config';

export const AD_UNIT_IDS: Record<'wechat' | 'douyin', Record<AdPlacement, string>> = {
    wechat: { revive: 'adunit-TODO-revive', caravan: 'adunit-TODO-caravan', rush: 'adunit-TODO-rush' },
    douyin: { revive: 'TODO-revive', caravan: 'TODO-caravan', rush: 'TODO-rush' },
};

export interface AdService {
    readonly name: 'wechat' | 'douyin' | 'dev';
    /** 返回 true 表示用户完整看完广告，应当发放奖励 */
    showRewarded(placement: AdPlacement): Promise<boolean>;
}

interface RewardedVideoAd {
    show(): Promise<void>;
    load(): Promise<void>;
    onClose(cb: (res?: { isEnded?: boolean }) => void): void;
    offClose(cb: (res?: { isEnded?: boolean }) => void): void;
    onError(cb: (err: unknown) => void): void;
    offError(cb: (err: unknown) => void): void;
}

interface MiniGameApi {
    createRewardedVideoAd(opts: { adUnitId: string }): RewardedVideoAd;
}

class MiniGameAdService implements AdService {
    private cache = new Map<string, RewardedVideoAd>();

    constructor(readonly name: 'wechat' | 'douyin', private api: MiniGameApi) {}

    showRewarded(placement: AdPlacement): Promise<boolean> {
        const unitId = AD_UNIT_IDS[this.name][placement];
        if (unitId.includes('TODO')) {
            console.warn(`[ads] 广告位 ${placement} 未配置，使用模拟广告`);
            return devAd();
        }
        let ad = this.cache.get(unitId);
        if (!ad) {
            ad = this.api.createRewardedVideoAd({ adUnitId: unitId });
            this.cache.set(unitId, ad);
        }
        const theAd = ad;
        return new Promise<boolean>(resolve => {
            const cleanup = () => { theAd.offClose(onClose); theAd.offError(onError); };
            const onClose = (res?: { isEnded?: boolean }) => {
                cleanup();
                // 基础库较老时 res 为 undefined，视为看完
                resolve(!res || !!res.isEnded);
            };
            const onError = (err: unknown) => {
                console.warn('[ads] 广告出错', err);
                cleanup();
                resolve(false);
            };
            theAd.onClose(onClose);
            theAd.onError(onError);
            theAd.show()
                .catch(() => theAd.load().then(() => theAd.show()))
                .catch(onError);
        });
    }
}

function devAd(): Promise<boolean> {
    return new Promise(resolve => setTimeout(() => resolve(true), 1500));
}

export function createAdService(): AdService {
    const g = globalThis as unknown as { tt?: MiniGameApi; wx?: MiniGameApi };
    // 先判断抖音：部分抖音环境也会挂一个兼容的 wx 对象
    if (g.tt && typeof g.tt.createRewardedVideoAd === 'function') return new MiniGameAdService('douyin', g.tt);
    if (g.wx && typeof g.wx.createRewardedVideoAd === 'function') return new MiniGameAdService('wechat', g.wx);
    return { name: 'dev', showRewarded: () => devAd() };
}
