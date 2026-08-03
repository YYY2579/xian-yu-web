# 开发执行计划

## 目标

将《闲鱼低价商品监控系统技术方案设计文档》拆解为每项 1-3 小时的 Jira/Trello 风格开发工单，并输出至 `docs/`。

## 阶段

| 阶段                                | 状态      | 说明                                                               |
| ----------------------------------- | --------- | ------------------------------------------------------------------ |
| 1. 读取技术方案与确定边界           | completed | 确认仅输出开发执行计划，不编写业务代码。                           |
| 2. 设计工单粒度、依赖和验收口径     | completed | 已按 P0 MVP 到后续阶段排序。                                       |
| 3. 生成 Markdown 工单文档           | completed | 已创建完整任务列表。                                               |
| 4. 结构校验与交付                   | completed | 已核验 53 张工单的字段、依赖和 1-3 小时工时约束。                  |
| 5. 开源方案调研与 DeepSeek 开发流程 | completed | 已完成开源评估、Playwright ADR、主方案同步和 DeepSeek 交接提示词。 |

## 约束与决策

- 任务工时估算按单名熟悉项目的开发人员计算，不含等待外部授权的日历时间。
- 数据接入只覆盖已获授权的官方或合作数据源；不包含绕过风控的任务。
- MVP 使用单体 API + Worker 进程的逻辑边界，生产部署可独立扩缩容。

## 遇到的错误

| 错误                                          | 尝试次数 | 解决方案                                                                        |
| --------------------------------------------- | -------: | ------------------------------------------------------------------------------- |
| 工作目录不是 Git 仓库，无法运行 Git diff 检查 |        1 | 使用文件存在性、标题和字段完整性检查替代。                                      |
| GitHub CLI 未登录，无法使用认证仓库检索       |        1 | 改用 GitHub 公开仓库 API，只读取公开元数据和 README。                           |
| 环境缺少 jq，无法格式化 GitHub API 输出       |        1 | 使用 Node.js 的原生 fetch 和 JSON 解析输出精简元数据。                          |
| Context7 并行查询脚本括号不匹配               |        1 | 修正语法后重新执行，不影响调研结论。                                            |
| brew 安装 node/pnpm 失败                      |        1 | `/usr/local` 属 root 且 sudo 被禁，改用 workspace 内 `.toolchain/` 用户级安装。 |
| 下载 node 到 `~/.local` 被拒（EPERM）         |        2 | 沙箱禁止写 HOME；改为写入 workspace 内 `.toolchain/`。                          |
| TS7 报 `moduleResolution=node10 removed`      |        1 | 基线改用 `module: NodeNext` + `moduleResolution: NodeNext`。                    |
| build 产物全部落根 `dist/`                    |        1 | 基线 outDir 相对声明文件解析；子包 tsconfig 用 `${configDir}` 显式覆盖。        |
| vitest 报 "cannot be imported in CommonJS"    |        1 | vitest 4 纯 ESM；每包 `vitest.config.ts` 限定 `src/**/*.spec.ts` 排除 dist。    |

## 阶段 6：按工单执行开发（进行中）

| 阶段                                             | 状态        | 说明                                                                                                                                                                                                                              |
| ------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6. FND-002 初始化 Monorepo 与包边界              | completed   | 2026-08-03 完成：骨架、依赖、三连验证、git 推送。详见 progress.md。                                                                                                                                                               |
| 7. FND-003 建立配置与环境变量契约                | completed   | 2026-08-03 完成：@xianyu/config schema 校验 + 脱敏 + .env.example + 运行手册，提交 df16b23。                                                                                                                                      |
| 8. DB-001 建立用户与权限数据模型                 | completed   | 2026-08-03 完成：Prisma 7 users 表 + 迁移 + UserRepository + 嵌入式 PG 16.4 集成测试（7/7），提交 a718c26。                                                                                                                       |
| 9. DB-002 建立关键词监控任务数据模型             | completed   | 2026-08-03 完成：KeywordMonitor + 迁移 + MonitorRepository + 16 个集成测试，提交 c39e60f。                                                                                                                                        |
| 10. COL-001 定义数据源适配器和领域事件契约       | completed   | 2026-08-03 完成：RawProductEvent 契约 + DatasourceAdapter 接口 + 队列拓扑 + 15 个测试，提交 a149a4c。                                                                                                                             |
| 11. FND-006 建立日志、健康检查和链路追踪基线     | completed   | 2026-08-03 完成：observability 包（logger/tracing/metrics/health）+ 11 个测试，提交 1004be2。                                                                                                                                     |
| 12. FND-005 建立 CI 基线                         | completed   | 2026-08-03 完成：Biome+Prettier + GitHub Actions + 平台适配，五连验证全绿，提交 11ebdef。                                                                                                                                         |
| 13. FND-004 建立本地 Docker Compose 基础设施     | completed   | 2026-08-03 完成：compose 三服务 + init.sql + README + CI infra job（容器健康验收），提交 670a204。                                                                                                                                |
| 14. DB-003 建立商品与价格历史数据模型            | completed   | 2026-08-03 完成：Product/ProductPriceHistory + 迁移 + 双 Repository + 10 集成测试，提交 1ebad0a。                                                                                                                                 |
| 15. DB-004 建立通知、任务运行与审计数据模型      | completed   | 2026-08-03 完成：通知/运行/审计三模型 + 迁移 + 三 Repository + 11 集成测试，提交 fab8cc7。                                                                                                                                        |
| 16. PROC-001 实现商品字段标准化解析器            | completed   | 2026-08-03 完成：NormalizedProduct + normalizer + 9 单元测试，提交 3f40710。                                                                                                                                                      |
| 17. PROC-002 实现非交易商品过滤规则              | completed   | 2026-08-03 完成：词典 + 过滤规则 + 正负样本测试，提交 a454f55。                                                                                                                                                                   |
| 18. COL-003 实现调度任务选择、分布式锁和配额检查 | completed   | 2026-08-03 完成：CollectorJob + 锁 + 配额 + 调度服务 + 8 集成测试（docker Redis），提交 29a27de。                                                                                                                                 |
| 19. PROC-003 实现商品去重与主记录更新            | completed   | 2026-08-03 完成：去重器（稳定指纹）+ 5 集成测试，提交 70dbdc2。                                                                                                                                                                   |
| 20. PROC-004 实现价格历史写入与事件幂等          | completed   | 2026-08-03 完成：ProductObservedEvent + 幂等 handler + 5 集成测试，提交 4902ef3。                                                                                                                                                 |
| 21. PROC-005 实现清洗 Worker 队列处理            | completed   | 2026-08-03 完成：RabbitMq 封装 + 编排 handler + 集成测试，提交 071289c。                                                                                                                                                          |
| 22. DB-005 完成数据库索引、迁移和种子策略        | completed   | 2026-08-03 完成：迁移/种子脚本 + trgm 索引 + 运行手册，提交 26b9c56。                                                                                                                                                             |
| 23. PRI-001 实现可比样本查询与市场价基线         | completed   | 2026-08-03 完成：基线计算器 + 可比样本查询 + 11 测试，提交 d7a78fc。                                                                                                                                                              |
| 24. PRI-002 实现低价规则引擎                     | completed   | 2026-08-03 完成：低价规则纯函数 + 12 测试，提交 951cb8e。                                                                                                                                                                         |
| 25. API-001 初始化 NestJS API 应用               | completed   | 2026-08-03 完成：NestJS 11 骨架 + health + 统一错误 + 请求 ID，提交 b77dba2。                                                                                                                                                     |
| 26. API-002 实现用户注册、登录和会话             | completed   | 2026-08-03 完成：auth 模块 + 限流 + 7 测试，提交 b6c83c5。                                                                                                                                                                        |
| 27. API-003 实现关键词监控任务 CRUD              | completed   | 2026-08-03 完成：monitors CRUD + 隔离 + 8 测试，提交 40044fc。                                                                                                                                                                    |
| 28. PRI-003 实现商品事件匹配监控任务             | completed   | 2026-08-03 完成：matcher + 5 集成测试，提交 e5b3cfe。                                                                                                                                                                             |
| 29. NTF-001 实现通知事件与模板                   | completed   | 2026-08-03 完成：模板 + 幂等通知服务 + 5 测试，提交 ecd689d。                                                                                                                                                                     |
| 30. 后续 P0 工单                                 | in_progress | 依赖已解锁：**API-004**（商品/价格历史查询，依赖 API-001/DB-003/DB-004✅）；**PRI-004**（P1 基线缓存）；**NTF-003/004**（P1 邮件/企微投递，需 EXT-002 凭据）。FND-001 剩余（ADR-001/ADR-002）可随时补；WEB 链路依赖 API-002/003。 |

执行规则：一次一个工单；开始前先查代码、未提交改动与依赖；完成后跑 typecheck/test/build，并更新 progress.md / findings.md / task_plan.md。
