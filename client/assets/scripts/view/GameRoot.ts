/**
 * 游戏入口组件。把它挂到场景的 Canvas 节点上即可（不需要任何美术资源）。
 * 它负责：创建界面、每帧驱动逻辑与绘制、把触摸事件转给 GameUI。
 */
import { _decorator, Component, EventTouch, Node, UITransform, Vec3 } from 'cc';
import { createAdService } from '../platform/ads';
import { GameUI } from '../ui/GameUI';
import { CocosPainter } from './CocosPainter';

const { ccclass } = _decorator;

@ccclass('GameRoot')
export class GameRoot extends Component {
    private ui!: GameUI;
    private painter!: CocosPainter;
    private tf!: UITransform;
    private lastW = 0;
    private lastH = 0;
    private tmp = new Vec3();

    onLoad(): void {
        this.tf = this.getComponent(UITransform) ?? this.addComponent(UITransform)!;
        this.painter = new CocosPainter(this.node);
        this.ui = new GameUI(createAdService());
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    onDestroy(): void {
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    }

    update(dt: number): void {
        const { width, height } = this.tf.contentSize;
        if (width !== this.lastW || height !== this.lastH) {
            this.lastW = width;
            this.lastH = height;
            this.ui.resize(width, height);
        }
        this.ui.update(Math.min(dt, 0.1));
        this.ui.render(this.painter);
    }

    private onTouchEnd(e: EventTouch): void {
        const loc = e.getUILocation();
        this.tmp.set(loc.x, loc.y, 0);
        const local = this.tf.convertToNodeSpaceAR(this.tmp);
        // 节点坐标（中心为原点、y 向上）→ 界面坐标（左上为原点、y 向下）
        this.ui.tap(local.x + this.lastW / 2, this.lastH / 2 - local.y);
    }
}
