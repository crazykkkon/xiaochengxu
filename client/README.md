# 《最后的绿洲》Cocos Creator 工程

这个目录是 Cocos Creator 3.8 工程。界面全部用代码绘制，**不需要任何美术资源**。

## 第一次打开（约 3 分钟）

1. 安装 **Cocos Dashboard**，用它安装 **Cocos Creator 3.8.x**（3.8.6 及以上都可以）。
2. Dashboard → 项目 → **添加/导入**，选择本目录 `client/`。
   第一次打开会自动生成 `library/`、`temp/`、`settings/` 等目录，需要等一会。
3. 新建场景：资源管理器 `assets/` 右键 → 创建 → **Scene**，命名为 `main`，双击打开。
4. 层级管理器右键 → 创建 → UI 组件 → **Canvas**（如果场景里已经有 Canvas 就跳过）。
5. 选中 **Canvas** 节点 → 属性检查器底部 **添加组件** → 搜索 `GameRoot` → 添加。
6. 菜单 项目 → 项目设置 → **项目数据**：
   - 设计分辨率：宽 `720`，高 `1280`
   - 勾选 **适配屏幕宽度**（Fit Width），不勾选适配高度
7. 点顶部 ▶ **预览**，浏览器里就能玩了。

> 如果第 2 步导入失败：用 Dashboard 新建一个「空项目（2D）」，
> 把本目录的 `assets/scripts` 整个复制进去，再继续第 3 步。

## 发布到微信 / 抖音

菜单 项目 → **构建发布**：
- 发布平台选「微信小游戏」或「抖音小游戏」，填入你的 AppID，屏幕方向选**竖屏**，初始场景选 `main`。
- 构建完成后，用「微信开发者工具」或「抖音开发者工具」打开构建目录即可真机预览。

广告：在 `assets/scripts/platform/ads.ts` 里把 `AD_UNIT_IDS` 的占位符换成平台后台申请的激励视频广告位 ID。
没换之前会自动使用「模拟广告」（等 1.5 秒直接发奖励），方便测试。

## 代码结构

```
assets/scripts/
  core/        纯逻辑（不依赖引擎，可单元测试）
    config.ts    所有数值：建筑、心泉塔、气候、事件、广告奖励
    game.ts      模拟：资源、温度、人口、民心、建造、事件、胜负
    rng.ts       可存档的随机数
  ui/          界面（不依赖引擎）
    GameUI.ts    整个游戏画面和交互
    layout.ts    环形地图几何计算
    painter.ts   绘图接口
  platform/
    ads.ts       激励视频：微信 / 抖音 / 模拟
  view/        Cocos 专属
    GameRoot.ts      入口组件（挂到 Canvas 上）
    CocosPainter.ts  用 Graphics + Label 实现绘图接口
```

core 和 ui 两个目录不能 `import 'cc'`，这样同一套代码还能在浏览器预览和自动模拟里运行。
