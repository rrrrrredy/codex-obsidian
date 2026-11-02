# Codex → Obsidian

把 Codex 的对话、工作过程和每日分析整理进 Obsidian。

你继续做事，Codex 负责留下完整记录、写每日综合、更新项目笔记；之后查一个判断，可以点回当时的原文。需要远端同步时，沿用 Obsidian 官方 Sync。

## 安装与开始

把本仓库作为一个 skill 放到 Codex 可发现的技能目录，例如 `~/.agents/skills/codex-obsidian/`。也可以在 Codex 中直接说：

```text
请安装 https://github.com/rrrrrredy/codex-obsidian 中的 skill。
```

安装后调用：

```text
$codex-obsidian
把今天的 Codex 对话和工作记录整理到我的 Obsidian。
写好每日综合，保留原文与工具过程的链接。
已有目录和同步方式继续使用。
```

第一次接入时提供或由 Codex 识别本地 vault 的位置。已有库先接收原有内容，再写入新笔记；不必为了使用这个 skill 另建一个库。

## 会留下什么

| 内容 | 呈现方式 |
| --- | --- |
| 提示词、回复、补充要求 | 可直接阅读的完整对话 Markdown |
| 工具调用、错误与修复 | 可读过程记录和有稳定事件ID的 JSONL |
| 决策与修订 | 项目笔记里的经过、依据、反馈和原文链接 |
| 每日综合 | 覆盖当天所有主题的分析文章 |
| 长期认识与方法 | 持续更新的主题笔记、提示词和可复用材料 |
| 数据集、任务、环境、评测 | 有实际材料时形成对应资产与说明 |

“每日综合”由 Codex 阅读材料后写作，包括实际成果、判断依据、观点变化、经验和新方向。脚本负责采集与去重，不代替分析。

## 如何接通

```text
Codex 对话与工作记录
        ↓
Codex 采集、阅读、分析和归类
        ↓
本地 Obsidian vault 中的 Markdown
        ↓
已配置的 Obsidian Sync
```

写笔记不要求额外社区插件，也不依赖 Obsidian CLI。同步可沿用桌面端，或在需要无界面运行时使用官方 Headless；同一库不要同时运行两种同步客户端。

## 目录起点

```text
Codex汇总/
  01-每日汇总/YYYY/YYYY-MM/YYYY-MM-DD/
  02-完整对话/
  03-项目与任务/
  04-知识与认识/
  05-复用材料/
  06-数据集/
  07-任务包/
  08-环境/
  09-评测/
  10-原始资料与附件/
  11-模板与索引/
```

已有分类优先；新库可从这套结构开始。每个日期有自己的综合文章与索引；不同来源按项目和主题合并。没有材料的类别不制造空内容。文件都是普通 Markdown，不要求看板或数据库插件。

## 自带采集器

需要 Node.js 20 或更高版本，无第三方依赖。

```sh
node collect.mjs --source "/path/to/.codex" --out "/path/to/archive-work" --timezone Asia/Shanghai
```

- 同时读取 `sessions` 和 `archived_sessions`，可传多个 `--source`。
- 按源文件变化增量采集，同一会话的副本合并，真实的重复提示词仍保留。
- 产出 `vault/` 下的记录，以及库外的 `manifest.json` 和 `read-plan.json`。
- 事件有稳定锚点，项目笔记和每日文章可以直接链接。
- 采集器不直接改动实际 vault，也不自动分析、同步或复制任意附件；后续由 skill 指导 Codex 完成。
- 源日志格式可能随 Codex 版本变化；不支持的记录和未写完的尾行留在阅读计划中，供 Codex 接续处理。

试用仓库中的虚构示例：

```sh
node -e "const fs=require('node:fs');for(const [a,b] of [['demo-main.jsonl','sessions/main.jsonl'],['demo-review.jsonl','sessions/review.jsonl'],['demo-archived.jsonl','archived_sessions/old.jsonl']]){const p='.local/source/'+b;fs.mkdirSync(require('node:path').dirname(p),{recursive:true});fs.copyFileSync(a,p);}"
node collect.mjs --source .local/source --out .local/demo --timezone Asia/Shanghai
```

[示例说明与综合文章](examples.md)展示完整提示、两次“继续”、失败后修正、工具结果、跨日子任务和已归档会话如何对应。所有示例均为人工编写的虚构资料。

## 日常使用

对 Codex 说“每天18:00整理”时，由它在当前环境中建立或更新定时任务，负责从采集到同步的完整工作。本地任务需要设备可运行，恢复后按原日期补齐遗漏批次。

媒体密集项目可以保留完整原件、同步关键材料和索引；普通项目继续按原定范围归档。归档过程中不改变现有项目的开发规则。

## 文件导航

- [SKILL.md](SKILL.md)：执行入口
- [连接与同步](SKILL.md#连接与同步)：首次接入、官方客户端、中断接续
- [归档规则](SKILL.md#原文过程与素材)：原文、事件、去重、附件
- [目录与链接](SKILL.md#目录与链接)：分类与可追溯关系
- [每日综合与复用](SKILL.md#每日综合与长期复用)：阅读方法、长期材料和定时运行

依据 [Codex skills 规范](https://developers.openai.com/codex/skills/) 和 [Obsidian 官方同步文档](https://obsidian.md/help/sync/headless)制作。采集器适配常见本地记录；语义分析和执行由当前 Codex 完成。

MIT License。
