# 《坠井者》协作须知（给 Codex 和其他 AI 助手）

这个仓库的默认分支是 `claude/steam-age-mini-program-jmovof`。《坠井者》的制作由 Codex 和 Claude 轮流接手，两边靠同一份交接稿对齐进度。

## 分工
- Codex 主要负责《坠井者》的美术，包括像素素材、场景表现、实机可读性和美术交接。

## 开工前必读
1. 读 `docs/坠井者_Steam_Demo_单英雄20层_制作交接稿.docx` 全文（可以用 `pandoc 文件.docx -t markdown` 转成文字）。
2. **特别看文末最新的《Claude 制作进度回报》**：Claude 做完了什么、东西放在哪、遇到的问题、需要制作人决定的事。
3. 设计方案的同步副本在 `docs/descent/game-design.md`。**当前玩法是第二十五章的断臂转轮版**（井的契约、楼梯口情报、井中轮老虎机、武器格已去掉）。

## 怎么对待交接稿里的内容
- 标为"已确认"或"沿用原案"的：按定论处理。
- 其余（建议、待验证、层位、价格、数值、规格）：都是讨论项，采纳前先和制作人确认。
- 交接稿、设计方案和代码之间有冲突时，列出来让制作人决定，不要自己选边。

## 代码在哪
- 游戏代码在另一个仓库 **crazykkkon/descent**（main 分支）：
  - `love/`：Steam 版，LÖVE + Lua
  - `src/core/`：TypeScript 原型，是规则的参照实现；`src/core/mainline.ts` 是 20 层关卡数据的唯一来源
  - 改规则的流程：先改原型 → `npm test` → `npm run vectors` → 改 `love/src/core/` → `npm run love:test` 必须 0 条不一致
- 安装包：https://github.com/crazykkkon/descent/releases/tag/love-latest

## 交接时
做完一轮工作后，在交接稿末尾追加一节进度回报（做了什么、放在哪、问题、待决定的事），提交到默认分支，方便下一位接手。
