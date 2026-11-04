# Codex 示例：将会话整理进 Obsidian

本示例将 [Agent → Obsidian](../../README.md) 的通用方法用于 Codex，包含原仓库的本地会话采集器、演示数据和具体使用方式。完整的整理流程见 [通用 SKILL.md](../../SKILL.md)。

## 在 Codex 中使用

将仓库作为 `agent-obsidian` skill 放到 Codex 可发现的技能目录，例如 `~/.agents/skills/agent-obsidian/`，也可以直接要求：

```text
请安装 https://github.com/rrrrrredy/agent-obsidian 中的 skill。
```

随后调用：

```text
$agent-obsidian
把今天的 Codex 对话和工作记录整理到我的 Obsidian。
写好每日综合，保留原文与工具过程的链接。
已有目录和同步方式继续使用。
```

提供或识别本地 vault 的位置；已有库先接收现有内容，再合并新笔记。优先使用当前环境提供的会话读取能力。需要读取本地会话日志时，使用下面的采集器。

## 本地会话采集器

需要 Node.js 20 或更高版本，无第三方依赖。从仓库根目录运行：

```sh
node examples/codex/collect.mjs --source "/path/to/.codex" --out "/path/to/archive-work" --timezone Asia/Shanghai
```

- 同时读取 `sessions` 和 `archived_sessions`，可传多个 `--source`。
- 按源文件变化增量采集，同一会话的副本合并，真实的重复提示词仍保留。
- 产出 `vault/` 下的记录，以及库外的 `manifest.json` 和 `read-plan.json`。
- 使用 `--folder` 指定 vault 内的归档目录，默认 `Agent汇总`。继续原有归档时沿用原目录，例如 `--folder Codex汇总`。
- 事件有稳定锚点，项目笔记和每日文章可以直接链接。

采集器读取 Codex JSONL 中的 `session_meta`、`turn_context`、`response_item` 和 `event_msg`，保存用户与助手消息、工具调用及输出。它按源文件内容变化更新记录，保留稳定的会话与事件标识，并识别同一消息在事件流中的镜像。

`read-plan.json` 给出变化的会话、受影响日期及需要继续处理的日志条目。Codex 按计划读取全文，再写每日综合和项目笔记。`vault/` 是待合并内容，`manifest.json` 和 `read-plan.json` 留在库外；将新记录合入已有笔记后，沿用既有方式同步。

采集器只负责整理会话记录；分析、附件归类、笔记合并与同步由执行任务的 Agent 按通用方法完成。

## 演示数据

以下资料均为人工编写的虚构任务，用来展示记录与笔记之间的对应关系：

- [demo-main.jsonl](demo-main.jsonl)：主任务，包含完整提示、两次“继续”、首次失败与后续修正、工具调用与结果。
- [demo-review.jsonl](demo-review.jsonl)：跨到本地日期次日的子任务，保留父任务ID。
- [demo-archived.jsonl](demo-archived.jsonl)：已归档的命名讨论。

从仓库根目录准备并采集这些文件：

```sh
node -e "const fs=require('node:fs');for(const [a,b] of [['demo-main.jsonl','sessions/main.jsonl'],['demo-review.jsonl','sessions/review.jsonl'],['demo-archived.jsonl','archived_sessions/old.jsonl']]){const p='.local/source/'+b;fs.mkdirSync(require('node:path').dirname(p),{recursive:true});fs.copyFileSync('examples/codex/'+a,p);}"
node examples/codex/collect.mjs --source .local/source --out .local/demo --timezone Asia/Shanghai
```

[每日综合与方法笔记示例](../../examples.md) 展示如何阅读这些记录、串起过程并提炼经验。

## 从这个示例接入其他 Agent

保留通用方法中的归档结构、原文链接、每日综合和项目笔记。将本示例的 `.codex` 路径与日志字段换成实际来源的读取入口和字段；如果环境可以直接读取会话或已经提供导出文件，就直接使用这些材料。

来源记录仍注明实际 Agent，项目内容按任务和主题合并。
