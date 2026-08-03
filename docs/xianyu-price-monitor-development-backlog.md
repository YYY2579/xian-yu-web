# 闲鱼低价商品监控系统开发执行计划

> 来源：`docs/xianyu-price-monitor-technical-design.md`  
> 文档用途：研发排期、Jira/Trello 建单和迭代验收  
> 估时口径：单名熟悉项目的开发人员工时；每项控制在 1-3 小时，不包含外部审批和等待时间。  
> 合规前提：数据采集任务仅允许接入官方 API、书面授权的合作数据源或用户明确授权的数据。

## 1. 执行规则

### 1.1 工单状态

- `Todo`：尚未开始。
- `In Progress`：正在开发或验证。
- `Blocked`：被外部条件或前置工单阻塞。
- `Done`：完成标准和测试方法均已满足。

### 1.2 优先级

- `P0`：MVP 核心链路，未完成不能发布内部试用。
- `P1`：MVP 完整体验或稳定性要求。
- `P2`：优化、商业化或规模化能力。

### 1.3 依赖规则

- `依赖：无` 表示可以直接开始。
- `依赖：TASK-ID` 表示前置任务达到 `Done` 后才能开始。
- 多个依赖全部完成后才可开始；外部依赖单独标记为 `EXT-*`。
- 具备共同依赖的工单可并行执行，但仍按本清单编号管理。

### 1.4 外部前置条件

| 编号 | 前置条件 | 责任方 | 影响 |
|---|---|---|---|
| EXT-001 | 获得合法、稳定的数据源授权和调用配额 | 产品/法务/数据合作方 | 阻塞 COL-002 及后续真实采集验收 |
| EXT-002 | 邮件服务或企业微信机器人凭据 | 运维/产品 | 阻塞 NTF-002 的真实渠道验收 |
| EXT-003 | 测试域名、HTTPS 和测试账号 | 运维/测试 | 阻塞 WEB/API 联调和 E2E |

---

## 2. Phase 0：项目基础与架构基线

### [FND-001] 确认 MVP 范围与架构决策

- 工时：1h
- 优先级：P0
- 依赖：无
- 目标：把技术方案中的 MVP 边界、非目标和关键技术决策固化为可评审记录。
- 涉及文件：`docs/adr/ADR-001-mvp-scope.md`、`docs/adr/ADR-002-data-source-compliance.md`
- 技术要求：记录采集合法性、规则引擎优先于模型、异步事件链路和自动下单不在范围内等决策。
- 输入：技术方案、产品 MVP 目标、数据源现状。
- 输出：两份 ADR、MVP 退出条件和风险清单。
- 完成标准：产品、研发和安全负责人对范围及数据来源边界完成评审。
- 测试方法：逐项对照 MVP 验收指标进行评审，无未决范围冲突。

### [FND-002] 初始化 Monorepo 与包边界

- 工时：2h
- 优先级：P0
- 依赖：FND-001
- 目标：建立前端、API、Worker 和共享包的统一项目结构。
- 涉及文件：`package.json`、`pnpm-workspace.yaml`、`apps/*/package.json`、`packages/*/package.json`、`tsconfig.base.json`
- 技术要求：使用 pnpm workspace；开启 TypeScript strict；统一脚本命名和 Node.js 版本。
- 输入：生产级目录结构、团队 Node.js 版本约定。
- 输出：可安装、可构建的空项目骨架。
- 完成标准：一次命令完成依赖安装；所有应用和共享包可被 workspace 识别。
- 测试方法：执行安装、类型检查和空构建；确认无跨包循环依赖。

### [FND-003] 建立配置与环境变量契约

- 工时：1.5h
- 优先级：P0
- 依赖：FND-002
- 目标：统一各服务的配置读取、校验和环境区分。
- 涉及文件：`packages/config/src/index.ts`、`.env.example`、`docs/runbooks/configuration.md`
- 技术要求：使用 schema 校验必填配置；禁止在代码和日志中输出密钥；区分 development/test/staging/production。
- 输入：数据库、Redis、队列、通知渠道和数据源配置清单。
- 输出：共享配置包、环境变量样例和配置说明。
- 完成标准：缺少必填配置时服务启动失败并给出明确错误；样例不含真实密钥。
- 测试方法：使用合法、缺失、非法类型三组配置运行启动校验。

### [FND-004] 建立本地 Docker Compose 基础设施

- 工时：2h
- 优先级：P0
- 依赖：FND-002、FND-003
- 目标：让开发人员可一键启动 API 所需的本地依赖。
- 涉及文件：`docker-compose.yml`、`infra/compose/postgres/init.sql`、`infra/compose/README.md`
- 技术要求：包含 PostgreSQL、Redis、RabbitMQ；持久化卷、健康检查、非默认开发密码和独立网络。
- 输入：服务连接配置、数据库版本、队列拓扑约定。
- 输出：可启动的本地基础设施和连接说明。
- 完成标准：容器全部健康；应用可从容器网络连接三项基础设施。
- 测试方法：启动/停止/重启容器，检查健康状态和数据卷持久化。

### [FND-005] 建立 CI 基线

- 工时：2h
- 优先级：P0
- 依赖：FND-002
- 目标：在合并前自动执行格式、静态检查、类型检查和单元测试。
- 涉及文件：`.github/workflows/ci.yml`、`eslint.config.*`、`prettier.config.*`、`vitest.config.*`
- 技术要求：锁定依赖安装；失败即阻断合并；缓存依赖但不缓存测试结果。
- 输入：Monorepo 脚本和团队分支策略。
- 输出：可执行的 CI 工作流和本地等价命令。
- 完成标准：提交一次示例变更能触发 CI；故意引入类型错误时 CI 失败。
- 测试方法：分别验证成功流水线和预期失败流水线。

### [FND-006] 建立日志、健康检查和链路追踪基线

- 工时：2h
- 优先级：P0
- 依赖：FND-003、FND-004
- 目标：所有服务具备统一日志格式和基础可观测性。
- 涉及文件：`packages/observability/src/logger.ts`、`packages/observability/src/metrics.ts`、`packages/observability/src/tracing.ts`
- 技术要求：JSON 日志、request_id/trace_id、健康检查和敏感字段脱敏；不记录凭据和完整个人信息。
- 输入：服务列表、错误等级约定、敏感字段清单。
- 输出：共享可观测性包和服务接入规范。
- 完成标准：API 请求和 Worker 消费均能关联 trace_id；健康检查能区分应用和依赖异常。
- 测试方法：本地制造数据库断开和业务错误，检查日志字段及脱敏结果。

---

## 3. Phase 1：数据模型与持久化

### [DB-001] 建立用户与权限数据模型

- 工时：2h
- 优先级：P0
- 依赖：FND-002、FND-003
- 目标：支持用户生命周期、套餐标识和软删除。
- 涉及文件：`packages/database/prisma/schema.prisma`、`packages/database/migrations/*`、`packages/database/src/repositories/user.repository.ts`
- 技术要求：UUID 主键；邮箱唯一索引；密码只保存强哈希；用户状态和套餐使用枚举或约束。
- 输入：用户表设计、权限和套餐状态定义。
- 输出：用户迁移脚本、Repository 接口和基础查询。
- 完成标准：可创建、查询、更新、禁用和软删除用户；唯一约束生效。
- 测试方法：迁移测试、Repository 集成测试、重复邮箱和非法状态测试。

### [DB-002] 建立关键词监控任务数据模型

- 工时：2h
- 优先级：P0
- 依赖：DB-001
- 目标：持久化用户关键词、价格阈值、筛选条件和调度状态。
- 涉及文件：`packages/database/prisma/schema.prisma`、`packages/database/src/repositories/monitor.repository.ts`、`packages/database/migrations/*`
- 技术要求：金额使用分为单位的整数；频率、阈值、状态有范围校验；`status + next_run_at` 建索引。
- 输入：关键词监控表设计和套餐限制。
- 输出：监控任务迁移和 Repository。
- 完成标准：任务可创建、暂停、恢复、更新和按到期时间查询。
- 测试方法：数据库约束测试、分页查询测试、任务状态转换测试。

### [DB-003] 建立商品与价格历史数据模型

- 工时：2.5h
- 优先级：P0
- 依赖：FND-004
- 目标：支持商品主记录、当前价和多次观察价格的持久化。
- 涉及文件：`packages/database/prisma/schema.prisma`、`packages/database/src/repositories/product.repository.ts`、`packages/database/src/repositories/price-history.repository.ts`
- 技术要求：来源商品 ID 唯一；金额单位为分；价格历史按观察时间预留分区方案；原始 payload 设置访问边界。
- 输入：商品表和价格历史表设计。
- 输出：商品、价格历史迁移及 Repository。
- 完成标准：重复来源商品不会创建第二条主记录；价格历史可按商品和时间倒序查询。
- 测试方法：唯一冲突测试、批量写入测试、时间范围查询测试。

### [DB-004] 建立通知、任务运行与审计数据模型

- 工时：2h
- 优先级：P0
- 依赖：DB-001、DB-002、DB-003
- 目标：支持通知幂等、渠道状态、任务执行审计和管理操作追踪。
- 涉及文件：`packages/database/prisma/schema.prisma`、`packages/database/src/repositories/notification.repository.ts`、`packages/database/src/repositories/run.repository.ts`、`packages/database/src/repositories/audit.repository.ts`
- 技术要求：`idempotency_key` 唯一；通知状态可重试；审计记录不可由普通用户 API 修改。
- 输入：通知记录、monitor_runs、audit_logs 设计。
- 输出：迁移、Repository 和状态枚举。
- 完成标准：相同幂等键只能成功插入一条；失败通知能记录重试次数。
- 测试方法：并发插入幂等测试、状态流转测试、权限隔离测试。

### [DB-005] 完成数据库索引、迁移和种子策略

- 工时：2h
- 优先级：P1
- 依赖：DB-001、DB-002、DB-003、DB-004
- 目标：使本地、测试和预发布环境可以稳定初始化数据库。
- 涉及文件：`packages/database/src/seed.ts`、`packages/database/scripts/migrate.ts`、`docs/runbooks/database.md`
- 技术要求：迁移可重复执行；种子数据只用于测试；覆盖全文标题、状态、时间和关联字段索引。
- 输入：全部 schema 和核心查询路径。
- 输出：迁移命令、测试种子和数据库运行手册。
- 完成标准：空数据库可从零迁移；已存在数据升级不丢失；索引与查询计划符合预期。
- 测试方法：空库迁移、升级迁移、回滚演练和 EXPLAIN 基础检查。

---

## 4. Phase 1：后端 API 与鉴权

### [API-001] 初始化 NestJS API 应用

- 工时：2h
- 优先级：P0
- 依赖：FND-002、FND-003、FND-006、DB-005
- 目标：提供统一 API 启动、模块注册、错误处理和版本前缀。
- 涉及文件：`apps/api/src/main.ts`、`apps/api/src/app.module.ts`、`apps/api/src/common/filters/*`、`apps/api/src/common/pipes/*`
- 技术要求：启用全局 DTO 校验、统一错误响应、CORS 白名单、请求 ID 和 OpenAPI 基础配置。
- 输入：服务配置和数据库连接。
- 输出：可健康检查的 API 服务。
- 完成标准：`/health` 返回应用及依赖状态；非法 DTO 返回统一错误结构。
- 测试方法：启动测试、健康检查、非法请求和未捕获异常测试。

### [API-002] 实现用户注册、登录和会话

- 工时：3h
- 优先级：P0
- 依赖：API-001、DB-001
- 目标：提供用户注册、登录、登出和当前用户查询。
- 涉及文件：`apps/api/src/modules/auth/*`、`apps/api/src/modules/users/*`、`packages/contracts/src/auth/*`
- 技术要求：密码强哈希；短时访问令牌 + 可撤销刷新机制；登录失败限流；不返回密码字段。
- 输入：邮箱、密码、显示名和会话配置。
- 输出：鉴权 API、Guard、DTO 和用户信息接口。
- 完成标准：正常用户可登录并访问受保护接口；禁用用户和错误密码不能登录。
- 测试方法：注册/登录集成测试、令牌过期测试、密码不泄漏测试、登录限流测试。

### [API-003] 实现关键词监控任务 CRUD

- 工时：3h
- 优先级：P0
- 依赖：API-002、DB-002
- 目标：让用户创建、查看、修改、暂停和删除监控任务。
- 涉及文件：`apps/api/src/modules/monitors/*`、`packages/contracts/src/monitors/*`
- 技术要求：校验关键词长度、金额、频率和套餐额度；所有查询按 user_id 隔离；支持幂等创建。
- 输入：关键词、目标价、筛选条件、通知偏好和频率。
- 输出：监控任务 API、DTO、权限策略和 OpenAPI 文档。
- 完成标准：用户只能访问自己的任务；创建后生成 next_run_at；暂停任务不再被调度。
- 测试方法：CRUD 集成测试、越权访问测试、参数边界测试、重复请求幂等测试。

### [API-004] 实现商品、价格历史和通知查询

- 工时：2.5h
- 优先级：P0
- 依赖：API-001、DB-003、DB-004
- 目标：提供命中商品列表、详情、价格走势和通知记录查询。
- 涉及文件：`apps/api/src/modules/products/*`、`apps/api/src/modules/notifications/*`、`packages/contracts/src/products/*`
- 技术要求：分页、排序和时间范围过滤；不返回未授权 raw payload；详情链接须保持原始来源。
- 输入：用户 ID、任务 ID、商品 ID和查询条件。
- 输出：商品/价格/通知查询 API。
- 完成标准：查询结果分页稳定；用户不能读取他人商品命中和通知记录。
- 测试方法：分页一致性、越权、空结果和价格时间序列测试。

### [API-005] 补齐 API 安全、文档和错误码

- 工时：2h
- 优先级：P1
- 依赖：API-002、API-003、API-004
- 目标：统一 API 对外契约，方便前端联调和后续 SDK 使用。
- 涉及文件：`apps/api/src/common/errors/*`、`apps/api/src/common/guards/*`、`docs/api/openapi.yaml`
- 技术要求：错误码可枚举；敏感端点限流；OpenAPI 描述请求/响应/认证；生产关闭调试堆栈。
- 输入：现有 API DTO、鉴权策略和业务异常。
- 输出：错误码表、OpenAPI 文档和安全中间件配置。
- 完成标准：所有公开端点有响应契约；前端无需读取服务端实现即可联调。
- 测试方法：OpenAPI 生成检查、限流测试、错误码契约测试。

---

## 5. Phase 1：前端用户端

### [WEB-001] 建立前端应用壳与鉴权流程

- 工时：3h
- 优先级：P0
- 依赖：API-002、API-005、EXT-003
- 目标：提供登录、注册、会话恢复和受保护路由。
- 涉及文件：`apps/web/src/app/*`、`apps/web/src/features/auth/*`、`apps/web/src/lib/api-client.ts`
- 技术要求：统一 API client；处理过期会话和登出；避免把敏感凭据写入不安全存储；包含加载、空和错误状态。
- 输入：认证 API 契约、品牌基础样式。
- 输出：可登录的 Web 应用壳和导航布局。
- 完成标准：刷新页面后会话状态正确；未登录用户不能进入业务页。
- 测试方法：浏览器手工验证、组件测试、登录失败和会话过期测试。

### [WEB-002] 实现监控任务管理界面

- 工时：3h
- 优先级：P0
- 依赖：WEB-001、API-003
- 目标：完成关键词监控的创建、编辑、暂停、恢复和删除。
- 涉及文件：`apps/web/src/features/monitors/*`、`apps/web/src/app/monitors/page.tsx`
- 技术要求：表单前端校验与服务端错误展示；金额单位转换清晰；任务状态和下次运行时间可见。
- 输入：监控 API、字段规则、通知配置模型。
- 输出：监控任务列表、创建/编辑表单和状态操作。
- 完成标准：用户可独立完成创建任务并看到成功状态；错误信息可定位到字段。
- 测试方法：组件测试、表单边界测试、浏览器创建/暂停/删除流程。

### [WEB-003] 实现命中商品列表、详情和价格趋势

- 工时：3h
- 优先级：P0
- 依赖：WEB-001、API-004
- 目标：让用户查看命中商品及判断依据。
- 涉及文件：`apps/web/src/features/products/*`、`apps/web/src/app/matches/page.tsx`
- 技术要求：展示当前价格、市场基线、折扣比例、成色、地区、发现时间和原始链接；有空状态和加载失败状态。
- 输入：商品/价格/通知查询 API。
- 输出：命中列表、详情抽屉或页面、价格趋势组件。
- 完成标准：用户可从通知或列表打开原始链接；价格趋势时间顺序正确。
- 测试方法：组件测试、分页测试、空数据和异常数据渲染测试。

### [WEB-004] 实现通知偏好与账户设置

- 工时：2h
- 优先级：P1
- 依赖：WEB-001、API-003
- 目标：让用户配置通知渠道、免打扰时段和每日上限。
- 涉及文件：`apps/web/src/features/settings/*`、`apps/web/src/app/settings/page.tsx`
- 技术要求：渠道凭据不可明文回显；时间使用用户时区；保存操作具备幂等反馈。
- 输入：用户偏好 API 和通知渠道约束。
- 输出：设置页面、保存/恢复逻辑和校验提示。
- 完成标准：保存后重新进入页面配置一致；免打扰设置能被后端读取。
- 测试方法：组件测试、时区测试、保存失败回滚测试。

---

## 6. Phase 1：事件、队列与数据采集

### [COL-001] 定义数据源适配器和领域事件契约

- 工时：2h
- 优先级：P0
- 依赖：FND-001、FND-002
- 目标：隔离数据源差异，定义采集到处理的稳定事件格式。
- 涉及文件：`packages/datasource-sdk/src/adapter.ts`、`packages/contracts/src/events/raw-product-event.ts`、`packages/queue/src/topology.ts`
- 技术要求：事件带 source、event_id、observed_at 和 schema_version；适配器不得直接依赖业务数据库。
- 输入：数据源字段样例、商品领域模型。
- 输出：适配器接口、RawProductEvent 契约和队列名称。
- 完成标准：可使用固定 fixture 构造并校验事件；事件版本可演进。
- 测试方法：契约 schema 测试、缺失字段和版本不兼容测试。

### [COL-002] 实现首个合规数据源适配器

- 工时：3h
- 优先级：P0
- 依赖：COL-001、EXT-001
- 目标：把授权数据源的搜索结果转换为内部原始商品事件。
- 涉及文件：`apps/collector-worker/src/datasources/authorized-source.adapter.ts`、`apps/collector-worker/src/datasources/fixtures/*`
- 技术要求：以 Playwright 实现浏览器执行层，但必须封装在 `datasource-sdk` 适配器中；遵循接口配额和协议；超时、429、5xx 分级处理；不实现验证码或风控绕过；凭据和授权 `storageState` 从受控配置/密钥存储读取。
- 输入：授权凭据、关键词任务、数据源响应样例。
- 输出：标准 RawProductEvent、采集错误分类和数据源指标。
- 完成标准：在测试环境可按关键词返回事件；被限流时不连续重试；原始链接和来源 ID完整。
- 测试方法：本地 HTML/JSON fixture 解析测试、Playwright route mock、超时/429/5xx 模拟、配额计数测试；不得让 CI 依赖真实闲鱼页面。

### [COL-003] 实现调度任务选择、分布式锁和配额检查

- 工时：3h
- 优先级：P0
- 依赖：DB-002、FND-004、COL-001
- 目标：按 next_run_at、优先级和数据源配额产生采集任务。
- 涉及文件：`apps/scheduler/src/scheduler.service.ts`、`apps/scheduler/src/locks.ts`、`apps/scheduler/src/quota.ts`
- 技术要求：Redis 分布式锁；同一监控任务不得并发执行；锁有 TTL；失败后更新下一次运行时间。
- 输入：启用的监控任务、用户套餐、数据源配额。
- 输出：CollectorJob 消息、运行记录和调度指标。
- 完成标准：同一任务多实例只产生一个有效执行；超配额任务延期而非丢失。
- 测试方法：并发调度测试、锁过期测试、配额耗尽测试、时间边界测试。

### [COL-004] 实现采集 Worker 消费与事件发布

- 工时：3h
- 优先级：P0
- 依赖：COL-002、COL-003
- 目标：消费采集任务、执行适配器并发布原始商品事件。
- 涉及文件：`apps/collector-worker/src/worker.ts`、`apps/collector-worker/src/handlers/collect.handler.ts`、`packages/queue/src/retry.ts`
- 技术要求：消息确认在事件持久化/发布后执行；区分可重试与不可重试错误；记录 monitor_run。
- 输入：CollectorJob、数据源适配器、任务运行配置。
- 输出：RawProductEvent、采集结果和错误记录。
- 完成标准：Worker 重启后消息不丢；单次采集结果数、耗时和错误可追踪。
- 测试方法：Worker 集成测试、重复消息、进程重启和死信测试。

---

## 7. Phase 1：商品清洗与持久化处理

### [PROC-001] 实现商品字段标准化解析器

- 工时：3h
- 优先级：P0
- 依赖：COL-001、DB-003
- 目标：把不同来源字段转换为统一商品模型。
- 涉及文件：`apps/processor-worker/src/normalizers/product-normalizer.ts`、`packages/contracts/src/products/normalized-product.ts`
- 技术要求：标题清理、金额转分、运费识别、地区/成色枚举、发布时间解析；保留原始值用于审计。
- 输入：RawProductEvent fixture。
- 输出：NormalizedProduct 或明确的清洗失败原因。
- 完成标准：正常商品字段完整；非法价格、无链接、缺少来源 ID 被拒绝。
- 测试方法：固定样本单元测试、边界价格测试、中文/英文混合标题测试。

### [PROC-002] 实现非交易商品过滤规则

- 工时：3h
- 优先级：P0
- 依赖：PROC-001
- 目标：过滤求购、租赁、定金、配件、维修和明显营销商品。
- 涉及文件：`packages/pricing-engine/src/filters/non-trade-filter.ts`、`packages/pricing-engine/src/dictionaries/excluded-terms.ts`
- 技术要求：规则可配置且有版本号；过滤结果保留 reason，不直接静默丢弃。
- 输入：标准化标题、价格、类目和筛选配置。
- 输出：`accepted`/`rejected` 结果及规则原因。
- 完成标准：每条拒绝事件可解释；规则不会把合法主商品样本大面积误删。
- 测试方法：正负样本测试集、规则版本测试、误过滤回归测试。

### [PROC-003] 实现商品去重与主记录更新

- 工时：3h
- 优先级：P0
- 依赖：PROC-001、DB-003
- 目标：避免重复商品创建，并更新商品当前状态和最近发现时间。
- 涉及文件：`apps/processor-worker/src/deduplication/product-deduplicator.ts`、`packages/database/src/repositories/product.repository.ts`
- 技术要求：优先使用 source_product_id；无稳定 ID 时使用受控指纹；并发 upsert 不产生重复主记录。
- 输入：NormalizedProduct。
- 输出：新增/更新商品 ID和去重结果。
- 完成标准：重复事件只更新一条商品；商品价格变化能反映在 current_price。
- 测试方法：重复消息、并发 upsert、来源 ID变化和指纹冲突测试。

### [PROC-004] 实现价格历史写入与事件幂等

- 工时：2h
- 优先级：P0
- 依赖：PROC-003、DB-003
- 目标：为每次有效观察记录价格变化，并防止重复历史行。
- 涉及文件：`apps/processor-worker/src/handlers/price-history.handler.ts`、`packages/database/src/repositories/price-history.repository.ts`
- 技术要求：以 source_event_id 幂等；写入商品更新和价格历史使用事务或明确补偿策略。
- 输入：去重后的商品和事件 ID。
- 输出：价格历史记录和可供分析消费的 ProductObservedEvent。
- 完成标准：相同事件重复消费不增加历史行；不同价格或观察时间按策略记录。
- 测试方法：幂等重复消费测试、事务失败回滚测试、批量写入测试。

### [PROC-005] 实现清洗 Worker 队列处理

- 工时：2.5h
- 优先级：P0
- 依赖：PROC-002、PROC-003、PROC-004
- 目标：串联清洗、过滤、去重和价格事件发布。
- 涉及文件：`apps/processor-worker/src/worker.ts`、`apps/processor-worker/src/handlers/product-event.handler.ts`
- 技术要求：处理异常时保留原始事件引用；可重试数据库暂时故障；不可解析事件进入隔离队列。
- 输入：RawProductEvent。
- 输出：商品主表、价格历史、ProductObservedEvent 和处理指标。
- 完成标准：一条有效事件完成全链路；一条脏数据不阻塞后续消息。
- 测试方法：端到端 Worker 集成测试、坏消息隔离测试、数据库瞬断重试测试。

---

## 8. Phase 1：价格基线与低价判定

### [PRI-001] 实现可比样本查询与市场价基线

- 工时：3h
- 优先级：P0
- 依赖：DB-003、DB-005、PROC-004
- 目标：按关键词/类目/型号/成色计算中位市场价和样本统计。
- 涉及文件：`packages/pricing-engine/src/baseline/baseline-calculator.ts`、`packages/database/src/repositories/baseline.repository.ts`
- 技术要求：默认使用近 7 天有效样本；样本不足返回明确状态；剔除明显异常值；结果带计算时间和规则版本。
- 输入：标准商品特征、价格历史、监控筛选条件。
- 输出：market_price、sample_size、quartiles、confidence 和 baseline_status。
- 完成标准：样本足够时生成中位价；样本不足不输出“明显低于市场价”结论。
- 测试方法：固定价格样本测试、样本不足测试、异常值测试、时间窗口测试。

### [PRI-002] 实现低价规则引擎

- 工时：3h
- 优先级：P0
- 依赖：PRI-001、DB-002
- 目标：根据用户目标价和市场基线判断是否命中。
- 涉及文件：`packages/pricing-engine/src/rules/low-price-rule.ts`、`packages/pricing-engine/src/rules/rule-types.ts`
- 技术要求：规则纯函数化；金额用整数分；输出规则版本、命中原因、价格折扣、风险标记。
- 输入：当前价格、目标价、市场基线、样本数、筛选规则。
- 输出：LowPriceDecision，包括命中/未命中、score、reason 和 risk_score。
- 完成标准：相同输入永远得到相同结果；用户阈值、折扣阈值和样本下限均可测试。
- 测试方法：边界价格测试、样本不足测试、用户阈值优先级测试、属性测试。

### [PRI-003] 实现商品事件匹配监控任务

- 工时：3h
- 优先级：P0
- 依赖：API-003、PROC-005、PRI-002
- 目标：把标准商品匹配到用户监控任务并生成低价命中事件。
- 涉及文件：`apps/analyzer-worker/src/matcher/monitor-matcher.ts`、`apps/analyzer-worker/src/handlers/product-observed.handler.ts`
- 技术要求：关键词、排除词、类目和过滤条件匹配；用户任务隔离；高热关键词限制 fan-out；命中事件包含完整解释。
- 输入：ProductObservedEvent、启用监控任务、价格规则。
- 输出：LowPriceDetectedEvent。
- 完成标准：同一商品可匹配多个合法任务；不匹配的商品不生成事件；命中原因可在 API 查询。
- 测试方法：多任务匹配测试、排除词测试、任务暂停测试、消息重复测试。

### [PRI-004] 加入市场基线缓存与计算保护

- 工时：2h
- 优先级：P1
- 依赖：PRI-001、FND-004
- 目标：降低重复基线查询成本，保护数据库免受热点任务冲击。
- 涉及文件：`packages/pricing-engine/src/baseline/baseline-cache.ts`、`apps/analyzer-worker/src/limits.ts`
- 技术要求：Redis TTL；缓存键含规则版本和筛选摘要；缓存击穿使用锁或 single-flight；查询有超时。
- 输入：基线计算结果、关键词热度和缓存策略。
- 输出：缓存读写逻辑和基线查询指标。
- 完成标准：命中缓存不访问数据库；缓存失效只产生受控的一次计算。
- 测试方法：缓存命中/失效测试、并发击穿测试、Redis 不可用降级测试。

---

## 9. Phase 1：通知与幂等投递

### [NTF-001] 设计通知事件、模板和用户偏好解析

- 工时：2h
- 优先级：P0
- 依赖：PRI-003、API-003
- 目标：定义统一通知内容和渠道无关的投递请求。
- 涉及文件：`packages/contracts/src/events/low-price-detected-event.ts`、`apps/notifier-worker/src/templates/low-price.template.ts`、`apps/notifier-worker/src/preferences.ts`
- 技术要求：模板包含当前价、市场价、折扣、商品链接和风险提示；支持免打扰时段和每日上限。
- 输入：LowPriceDetectedEvent、用户通知偏好。
- 输出：NotificationCommand 和渲染模板。
- 完成标准：同一事件可以渲染为站内信和邮件；敏感字段不会进入模板日志。
- 测试方法：模板快照测试、偏好解析测试、免打扰边界测试。

### [NTF-002] 实现站内信和邮件/机器人通知适配器

- 工时：3h
- 优先级：P0
- 依赖：NTF-001、EXT-002
- 目标：至少支持站内通知和一种外部渠道的实际投递。
- 涉及文件：`apps/notifier-worker/src/channels/in-app.channel.ts`、`apps/notifier-worker/src/channels/email.channel.ts`、`apps/notifier-worker/src/channels/channel.ts`
- 技术要求：渠道适配器统一接口；外部凭据从密钥配置读取；超时、限流和供应商错误可分类。
- 输入：NotificationCommand、渠道配置和用户偏好。
- 输出：ProviderDeliveryResult、通知记录。
- 完成标准：测试账号能收到通知；站内通知可通过商品查询 API 看到；失败返回可诊断错误。
- 测试方法：渠道沙箱测试、供应商错误模拟、模板渲染和编码测试。

### [NTF-003] 实现通知幂等、重试和死信处理

- 工时：3h
- 优先级：P0
- 依赖：NTF-002、DB-004、FND-004
- 目标：保证重复消息不重复骚扰用户，临时失败可恢复。
- 涉及文件：`apps/notifier-worker/src/handlers/notification.handler.ts`、`packages/queue/src/dead-letter.ts`、`packages/database/src/repositories/notification.repository.ts`
- 技术要求：幂等键唯一；指数退避；最大重试次数；永久失败进入死信并可人工重放。
- 输入：LowPriceDetectedEvent、渠道结果和用户偏好。
- 输出：通知记录、队列 ACK/NACK、死信消息。
- 完成标准：同一幂等键最多产生一条成功通知；暂时性故障恢复后能发送；永久失败可追踪。
- 测试方法：重复消息、网络超时、供应商 4xx/5xx、死信重放测试。

### [NTF-004] 实现通知频率、每日上限和降级策略

- 工时：2h
- 优先级：P1
- 依赖：NTF-003、API-004
- 目标：防止热点关键词造成通知轰炸，确保渠道异常时仍保留站内结果。
- 涉及文件：`apps/notifier-worker/src/policy/notification-policy.ts`、`apps/notifier-worker/src/channels/fallback.ts`
- 技术要求：Redis 计数器带过期时间；外部渠道失败不删除站内命中；规则版本纳入幂等键。
- 输入：用户每日上限、免打扰配置、渠道健康状态。
- 输出：通知决策、降级结果和策略指标。
- 完成标准：达到上限后记录抑制原因；外部渠道不可用时站内信仍可用。
- 测试方法：计数器边界测试、跨天过期测试、渠道降级测试。

---

## 10. Phase 1：联调、测试和 MVP 发布

### [TST-001] 建立核心规则单元测试集

- 工时：2h
- 优先级：P0
- 依赖：PROC-002、PRI-002、NTF-001
- 目标：用固定样本锁定清洗、过滤和低价判定行为。
- 涉及文件：`packages/pricing-engine/tests/*`、`apps/processor-worker/tests/fixtures/*`
- 技术要求：覆盖正常、边界、异常低价、定金、租赁、配件、样本不足和规则版本。
- 输入：垂类商品样本和产品验收口径。
- 输出：可重复运行的单元测试和误报样本记录。
- 完成标准：核心规则覆盖率达到团队约定阈值；每个产品规则至少有正反样本。
- 测试方法：本地和 CI 执行单元测试；引入规则回归故障确认测试能失败。

### [TST-002] 建立数据库与队列集成测试

- 工时：3h
- 优先级：P0
- 依赖：COL-004、PROC-005、PRI-003、NTF-003
- 目标：验证从原始商品事件到通知命令的异步链路。
- 涉及文件：`tests/integration/product-pipeline.spec.ts`、`tests/support/containers.ts`、`packages/testing/src/fixtures.ts`
- 技术要求：测试使用隔离数据库和队列；验证 ACK、重试、幂等和数据库最终状态。
- 输入：本地 Compose 基础设施、固定商品 fixture。
- 输出：跨服务集成测试和失败诊断日志。
- 完成标准：有效商品能产生低价命中；重复事件只产生一条商品和通知记录。
- 测试方法：启动依赖后运行集成测试；模拟数据库和渠道短暂故障。

### [TST-003] 建立关键用户流程 E2E 测试

- 工时：3h
- 优先级：P0
- 依赖：WEB-002、WEB-003、NTF-002、EXT-003
- 目标：验证用户从注册到收到低价提醒的关键闭环。
- 涉及文件：`apps/web/tests/e2e/monitor-to-notification.spec.ts`、`tests/e2e/fixtures/*`
- 技术要求：使用测试数据源 fixture，不依赖实时外部平台；记录失败截图、请求和 trace。
- 输入：测试账号、测试域名、模拟数据源和通知沙箱。
- 输出：端到端验收脚本和测试报告。
- 完成标准：用户可注册、创建任务、触发商品事件并在页面看到命中和通知。
- 测试方法：Playwright 或等价浏览器测试，执行成功、失败和重复事件路径。

### [TST-004] 验证队列、API 和数据库基础性能

- 工时：3h
- 优先级：P1
- 依赖：TST-002、API-005、PRI-004
- 目标：找出 MVP 在预期并发下的瓶颈和资源基线。
- 涉及文件：`tests/load/*`、`docs/architecture/performance-baseline.md`
- 技术要求：至少覆盖 API 查询、采集任务入队、商品事件消费和通知幂等；记录 P95/P99、吞吐和错误率。
- 输入：MVP 目标用户数、热门关键词比例、测试环境资源。
- 输出：性能基线、瓶颈列表和优化建议。
- 完成标准：在预期负载下无数据丢失、无重复爆发和无超过约定的核心延迟。
- 测试方法：定量压测、阶梯负载、队列堆积观察和资源曲线分析。

### [REL-001] 部署预发布环境并完成配置核验

- 工时：2h
- 优先级：P0
- 依赖：FND-004、FND-005、API-005、TST-002
- 目标：将 API、Web、Scheduler 和 Worker 部署到可联调的预发布环境。
- 涉及文件：`infra/kubernetes/*`、`.github/workflows/deploy-staging.yml`、`docs/runbooks/staging-deploy.md`
- 技术要求：镜像不可变；配置通过密钥管理；健康检查、滚动更新和回滚路径可用。
- 输入：镜像、预发布资源、EXT-002/EXT-003 配置。
- 输出：预发布部署和部署运行手册。
- 完成标准：所有服务健康；日志、指标和队列状态可查看；能够回滚上一版本。
- 测试方法：部署、滚动升级、回滚和依赖异常演练。

### [REL-002] 执行 MVP 验收和试点清单

- 工时：2h
- 优先级：P0
- 依赖：TST-003、REL-001
- 目标：用统一清单确认 MVP 是否可交给小范围用户试用。
- 涉及文件：`docs/runbooks/mvp-acceptance.md`、`docs/runbooks/incident-response.md`
- 技术要求：验收包含数据源合规、任务成功率、通知时效、重复率、错误可审计和人工止损开关。
- 输入：预发布测试报告、产品验收指标和风险清单。
- 输出：签字版验收记录、已知问题清单和试点范围。
- 完成标准：P0 缺陷为零；未解决风险有负责人、截止时间和回滚方案。
- 测试方法：产品、研发、测试和安全联合走查；执行一条完整试点链路。

### [REL-003] 完成 MVP 生产发布准备

- 工时：3h
- 优先级：P0
- 依赖：REL-002、TST-004
- 目标：确保生产发布有容量、安全、备份、监控和回滚准备。
- 涉及文件：`infra/production/*`、`docs/runbooks/production-release.md`、`docs/runbooks/backup-restore.md`
- 技术要求：生产资源与配额确认；数据库备份可恢复；告警阈值和 on-call 责任明确；数据源可一键停用。
- 输入：预发布验收、性能基线、供应商配额和安全评审结果。
- 输出：生产发布清单、回滚步骤、值班表和上线后观察指标。
- 完成标准：上线前检查项全部签核；发生采集或通知异常时可止损、降级和恢复。
- 测试方法：备份恢复演练、数据源停用演练、回滚演练、告警触发测试。

---

## 11. Phase 2：优化迭代

### [OPT-001] 增加第二数据源适配层实现

- 工时：3h
- 优先级：P2
- 依赖：REL-003、COL-001、EXT-001
- 目标：验证多数据源适配层能降低单一来源依赖。
- 涉及文件：`apps/collector-worker/src/datasources/second-source.adapter.ts`、`docs/architecture/datasource-failover.md`
- 技术要求：复用统一契约、限流和错误分类；不把第二来源字段泄漏到核心领域模型。
- 输入：第二个合规数据源授权和字段样例。
- 输出：第二适配器、来源健康指标和降级配置。
- 完成标准：两个数据源都能产出同一内部事件；任一来源关闭不影响 API。
- 测试方法：适配器契约测试、来源切换、配额耗尽和字段缺失测试。

### [OPT-002] 增加品牌/型号/同义词词典管理

- 工时：3h
- 优先级：P2
- 依赖：PROC-002、REL-003
- 目标：提升关键词匹配和可比样本召回率。
- 涉及文件：`packages/pricing-engine/src/dictionaries/*`、`apps/api/src/modules/dictionaries/*`、`docs/api/dictionaries.md`
- 技术要求：词典有版本、发布和回滚；新增词条不直接修改历史判定结果。
- 输入：垂类词表、品牌和型号样本、用户反馈。
- 输出：词典数据结构、管理接口和匹配扩展。
- 完成标准：新词条可在不发布代码的情况下生效；误匹配可回滚。
- 测试方法：词典版本测试、匹配回归集、回滚测试。

### [OPT-003] 增加异常价格与风险提示

- 工时：3h
- 优先级：P2
- 依赖：PRI-001、PRI-002、PROC-002
- 目标：识别极端低价、信息缺失和高风险商品，降低误报与用户损失。
- 涉及文件：`packages/pricing-engine/src/risk/*`、`apps/notifier-worker/src/templates/risk-warning.template.ts`
- 技术要求：风险结论必须可解释；风险商品不默认静默丢弃，可按用户偏好降级提示。
- 输入：价格分布、标题敏感词、成色和描述完整度。
- 输出：risk_score、风险原因和通知展示字段。
- 完成标准：高风险命中显示明确提示；风险规则不会改变基础数据留存。
- 测试方法：风险样本集测试、边界分数测试和通知快照测试。

### [OPT-004] 增加价格趋势与历史最低价查询

- 工时：3h
- 优先级：P2
- 依赖：WEB-003、DB-003、PRI-001
- 目标：支持用户查看关键词和商品的价格变化趋势。
- 涉及文件：`apps/api/src/modules/products/trend.service.ts`、`apps/web/src/features/products/price-chart/*`
- 技术要求：时间范围和采样粒度可控；避免直接扫描全量历史；历史无数据时清晰提示。
- 输入：价格历史、商品/关键词维度、时间范围。
- 输出：趋势 API、图表数据和历史最低价字段。
- 完成标准：趋势数据时间和金额准确；查询在性能基线内完成。
- 测试方法：时间序列测试、空数据测试、查询性能测试。

### [OPT-005] 建立用户反馈与规则效果看板

- 工时：3h
- 优先级：P2
- 依赖：REL-003、OPT-003
- 目标：收集有效/误报反馈，为规则迭代提供指标。
- 涉及文件：`apps/api/src/modules/feedback/*`、`apps/web/src/features/feedback/*`、`docs/metrics/pricing-quality.md`
- 技术要求：反馈绑定商品、任务和规则版本；不允许用户修改历史判定；支持按时间和版本统计。
- 输入：用户反馈动作、通知记录和规则版本。
- 输出：反馈 API、前端操作和准确率看板指标。
- 完成标准：用户可标记反馈；研发可按规则版本计算误报趋势。
- 测试方法：反馈权限测试、统计口径测试和规则版本回归测试。

---

## 12. Phase 3：商业化与平台化预研

### [BIZ-001] 设计订阅套餐与额度模型

- 工时：3h
- 优先级：P2
- 依赖：REL-003
- 目标：把关键词数、采集频率、历史深度和通知渠道抽象为可计量权益。
- 涉及文件：`docs/adr/ADR-003-subscription-quota.md`、`packages/contracts/src/billing/*`、`packages/database/src/billing/*`
- 技术要求：额度计算可审计；套餐配置与业务逻辑解耦；超额行为可配置为阻断或降级。
- 输入：成本模型、试点用户数据和商业策略。
- 输出：套餐、额度、用量和超额状态设计。
- 完成标准：可以计算单用户当前额度和预计消耗；套餐变化不破坏历史记录。
- 测试方法：额度边界、并发扣减、套餐切换和降级测试。

### [BIZ-002] 设计支付、订阅和账单状态机

- 工时：3h
- 优先级：P2
- 依赖：BIZ-001
- 目标：明确支付回调、续费、退款、到期和人工补偿的边界。
- 涉及文件：`docs/architecture/billing-state-machine.md`、`apps/api/src/modules/billing/*`、`packages/database/src/billing/*`
- 技术要求：支付回调幂等；订单和权益状态分离；不在本任务接入真实支付密钥。
- 输入：套餐模型、支付渠道能力和财务要求。
- 输出：账单状态机、领域事件和异常处理清单。
- 完成标准：所有状态转换有前置、后置和补偿动作；重复回调不重复发放权益。
- 测试方法：状态机单元测试、重复回调和退款/到期场景测试。

### [BIZ-003] 设计开放 API、Webhook 和团队协作边界

- 工时：3h
- 优先级：P2
- 依赖：API-005、BIZ-001、REL-003
- 目标：形成企业客户与第三方集成的接口边界。
- 涉及文件：`docs/api/public-api.md`、`docs/api/webhooks.md`、`docs/adr/ADR-004-tenant-boundary.md`
- 技术要求：API key 生命周期、签名校验、幂等、版本和租户隔离必须明确；不直接开放内部事件。
- 输入：企业使用场景、权限模型和通知事件。
- 输出：公开 API 草案、Webhook 契约和租户边界设计。
- 完成标准：第三方可依据文档完成集成评估；安全评审无高风险未决项。
- 测试方法：契约样例校验、签名错误测试和租户越权场景评审。

### [BIZ-004] 评估垂类估价模型与数据闭环

- 工时：3h
- 优先级：P2
- 依赖：OPT-005、OPT-003
- 目标：评估从规则引擎演进到垂类估价模型所需的数据、指标和风险。
- 涉及文件：`docs/architecture/pricing-model-roadmap.md`、`docs/metrics/pricing-model-evaluation.md`
- 技术要求：明确标签来源、数据脱敏、离线评估、置信度、人工复核和模型回滚；不在本任务训练模型。
- 输入：历史商品、用户反馈、垂类选择和合规要求。
- 输出：模型需求、训练数据规范、评估指标和分阶段路线图。
- 完成标准：能判断是否具备训练数据；模型上线门槛和失败降级规则已定义。
- 测试方法：数据覆盖率检查、离线指标口径评审和偏差风险评审。

---

## 13. 排期建议

### Sprint 0：1-2 天

执行 `FND-001` 至 `FND-006`，完成项目骨架、环境和架构决策。

### Sprint 1：2-3 天

执行 `DB-001` 至 `DB-005`、`API-001`、`COL-001`，形成数据和事件契约。

### Sprint 2：3-4 天

执行 `API-002` 至 `API-005`、`WEB-001`、`WEB-002`、`COL-003`、`COL-004`。

### Sprint 3：3-4 天

执行 `PROC-001` 至 `PROC-005`、`PRI-001` 至 `PRI-003`、`NTF-001`。

### Sprint 4：3-4 天

执行 `NTF-002` 至 `NTF-004`、`WEB-003`、`WEB-004`、`TST-001`、`TST-002`。

### Sprint 5：2-3 天

执行 `TST-003`、`TST-004`、`REL-001` 至 `REL-003`，完成 MVP 试点发布。

### 后续迭代

按产品数据和用户反馈选择 `OPT-*` 与 `BIZ-*` 工单；不得在 MVP 未达到验收指标前直接投入商业化开发。

---

## 14. MVP 交付检查表

- [ ] 数据源授权、配额和使用边界已书面确认。
- [ ] 用户可以注册、登录、退出和恢复会话。
- [ ] 用户可以创建、编辑、暂停和删除关键词监控任务。
- [ ] 调度服务能够按照任务频率产生采集任务。
- [ ] 合规数据源能够返回标准化商品事件。
- [ ] 商品清洗、非交易过滤、去重和价格历史写入通过集成测试。
- [ ] 市场基线在样本足够时计算；样本不足时不产生虚假市场价结论。
- [ ] 低价规则输出可解释的命中原因、规则版本和风险字段。
- [ ] 站内通知和至少一个外部渠道可投递。
- [ ] 重复事件不会造成重复通知；失败消息可重试并进入死信。
- [ ] 前端可查看命中列表、价格和原始商品链接。
- [ ] API、Worker、队列和数据库具备日志、健康检查和核心指标。
- [ ] 预发布 E2E 通过，备份恢复和回滚演练通过。
- [ ] 所有 P0 缺陷关闭，剩余风险有负责人和止损方案。

## 15. 建单字段映射

| 本文档字段 | Jira/Trello 字段 |
|---|---|
| 工单编号和任务名称 | Issue Key / Card Title |
| 目标 | Description |
| 工时 | Original Estimate |
| 优先级 | Priority |
| 依赖 | Linked Issues / Blocked By |
| 涉及文件 | Technical Notes |
| 输入、输出 | Description / Acceptance Context |
| 完成标准 | Acceptance Criteria |
| 测试方法 | Test Plan |
