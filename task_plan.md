# 开发执行计划

## 目标

将《闲鱼低价商品监控系统技术方案设计文档》拆解为每项 1-3 小时的 Jira/Trello 风格开发工单，并输出至 `docs/`。

## 阶段

| 阶段 | 状态 | 说明 |
|---|---|---|
| 1. 读取技术方案与确定边界 | completed | 确认仅输出开发执行计划，不编写业务代码。 |
| 2. 设计工单粒度、依赖和验收口径 | completed | 已按 P0 MVP 到后续阶段排序。 |
| 3. 生成 Markdown 工单文档 | completed | 已创建完整任务列表。 |
| 4. 结构校验与交付 | completed | 已核验 53 张工单的字段、依赖和 1-3 小时工时约束。 |
| 5. 开源方案调研与 DeepSeek 开发流程 | completed | 已完成开源评估、Playwright ADR、主方案同步和 DeepSeek 交接提示词。 |

## 约束与决策

- 任务工时估算按单名熟悉项目的开发人员计算，不含等待外部授权的日历时间。
- 数据接入只覆盖已获授权的官方或合作数据源；不包含绕过风控的任务。
- MVP 使用单体 API + Worker 进程的逻辑边界，生产部署可独立扩缩容。

## 遇到的错误

| 错误 | 尝试次数 | 解决方案 |
|---|---:|---|
| 工作目录不是 Git 仓库，无法运行 Git diff 检查 | 1 | 使用文件存在性、标题和字段完整性检查替代。 |
| GitHub CLI 未登录，无法使用认证仓库检索 | 1 | 改用 GitHub 公开仓库 API，只读取公开元数据和 README。 |
| 环境缺少 jq，无法格式化 GitHub API 输出 | 1 | 使用 Node.js 的原生 fetch 和 JSON 解析输出精简元数据。 |
| Context7 并行查询脚本括号不匹配 | 1 | 修正语法后重新执行，不影响调研结论。 |
| brew 安装 node/pnpm 失败 | 1 | `/usr/local` 属 root 且 sudo 被禁，改用 workspace 内 `.toolchain/` 用户级安装。 |
| 下载 node 到 `~/.local` 被拒（EPERM） | 2 | 沙箱禁止写 HOME；改为写入 workspace 内 `.toolchain/`。 |
| TS7 报 `moduleResolution=node10 removed` | 1 | 基线改用 `module: NodeNext` + `moduleResolution: NodeNext`。 |
| build 产物全部落根 `dist/` | 1 | 基线 outDir 相对声明文件解析；子包 tsconfig 用 `${configDir}` 显式覆盖。 |
| vitest 报 "cannot be imported in CommonJS" | 1 | vitest 4 纯 ESM；每包 `vitest.config.ts` 限定 `src/**/*.spec.ts` 排除 dist。 |

## 阶段 6：按工单执行开发（进行中）

| 阶段 | 状态 | 说明 |
|---|---|---|
| 6. FND-002 初始化 Monorepo 与包边界 | completed | 2026-08-03 完成：骨架、依赖、三连验证、git 推送。详见 progress.md。 |
| 7. FND-003 建立配置与环境变量契约 | completed | 2026-08-03 完成：@xianyu/config schema 校验 + 脱敏 + .env.example + 运行手册，提交 df16b23。 |
| 8. 后续 P0 工单 | in_progress | 依赖已满足的下一个：DB-001（用户与权限数据模型，依赖 FND-002/FND-003✅）或 COL-001（数据源适配器与事件契约，依赖 FND-001/FND-002✅）。EXT-001 授权到位前 COL-002 保持 Blocked。 |

执行规则：一次一个工单；开始前先查代码、未提交改动与依赖；完成后跑 typecheck/test/build，并更新 progress.md / findings.md / task_plan.md。
