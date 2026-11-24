# 《坠井者》协作须知（给 Codex 和其他 AI 助手）

这个仓库的默认分支是 `claude/steam-age-mini-program-jmovof`。《坠井者》的制作由 Codex 和 Claude 轮流接手，两边靠同一份交接稿对齐进度。

## 分工
- Codex 主要负责《坠井者》的美术，包括像素素材、场景表现、实机可读性和美术交接。

## 开工前必读
1. 读 `docs/坠井者_Steam_Demo_单英雄20层_制作交接稿.docx` 全文（可以用 `pandoc 文件.docx -t markdown` 转成文字）。
2. 交接稿 2026-11-24 精简过一次，结构是：本版定案 → 制作人定下的事 → 当前玩法 → 进度和东西放在哪 → 待制作人决定的事 → 给 Codex（美术）→ Codex 美术进度回报。**之后新增的进度回报追加在文末**，先看文末有没有新的。
3. 设计方案的同步副本在 `docs/descent/game-design.md`（v0.37 起精简过）。**当前玩法是断臂转轮版**（第三～六章；井的契约、楼梯口情报、井中轮老虎机、武器格已去掉）。画面方向是制作人选定的 **A · 斜俯视立体 + 机械臂转轮**（第 8.1 节），美术按这个方向画。

## 怎么对待交接稿里的内容
- 标为"已确认"或"沿用原案"的：按定论处理。
- 其余（建议、待验证、层位、价格、数值、规格）：都是讨论项，采纳前先和制作人确认。
- 交接稿、设计方案和代码之间有冲突时，列出来让制作人决定，不要自己选边。

## 代码在哪
- 游戏代码在另一个仓库 **crazykkkon/descent**（main 分支）：
  - `love/`：Steam 版，LÖVE + Lua
  - `src/core/`：TypeScript 原型，是规则的参照实现；`src/core/route.ts` 是路线和地图池（小图原稿），`npm run expand` 放大成 16×11 存在 `src/core/bigmaps.ts`
  - 改规则的流程：先改原型 → `npm test` → `npm run vectors` → 改 `love/src/core/` → `npm run love:test` 必须 0 条不一致
- 安装包：https://github.com/crazykkkon/descent/releases/tag/love-latest

## 交接时
做完一轮工作后，在交接稿末尾追加一节进度回报（做了什么、放在哪、问题、待决定的事），提交到默认分支，方便下一位接手。
