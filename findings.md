# 规划发现

## 来源文档

- `docs/xianyu-price-monitor-technical-design.md`

## 关键约束

- MVP 的核心链路为：用户创建监控任务 -> 调度 -> 合规数据源采集 -> 清洗/去重 -> 价格分析 -> 通知。
- 技术方案的 P0 组件包括：认证、监控任务、调度、数据源适配、商品处理、价格分析和通知。
- 数据源授权是项目启动的外部前置条件，不能以技术实现替代合规审批。

## 工单拆分准则

- 单个工单估算 1-3 小时。
- 每个工单均包含目标、文件、技术要求、输入、输出、完成标准、测试方法和依赖。
- 任务按可交付顺序列出；并行任务仅在其前置依赖完成后启动。

## 开源项目调研

检索时间：2026-08-03；通过 GitHub 公开仓库元数据和 README 进行初筛。

| 项目 | 许可/活跃度 | 可借鉴内容 | 不建议直接复用的部分 |
|---|---|---|---|
| `Usagi-org/ai-goofish-monitor` | MIT；约 14.1k stars；Python/FastAPI/Playwright/React/SQLite/Docker | 任务管理、结果浏览、价格历史、通知渠道、运行日志和本地部署体验 | 浏览器自动化、账号登录态、代理/账号轮换和与闲鱼页面耦合的采集链路；需要单独做合规审查 |
| `tristanwqy/GooFish-AIMonitor` | MIT；约 17 stars；Python/FastAPI/Playwright/React/SQLite/Docker | AI 筛选、收藏降价/售罄事件、事件流、设置中心和本地数据边界 | 仍以浏览器登录和本地 SQLite 为中心，不适合作为多租户生产后端底座 |
| `voltwake/xianyu-monitor` | MIT；约 38 stars；Node/Puppeteer/SQLite | 关键词、价格/地区/排除词、去重和 Discord/Telegram 推送的最小闭环 | macOS/Chrome/AppleScript 依赖、浏览器自动化和 OpenClaw 定时模型，不适合服务端生产架构 |
| `bytesFighting/idlefish_xianyu_spider-crawler-sender` | MIT；约 296 stars；维护以历史版本为主 | 队列、筛选、钉钉推送和风控暂停的领域经验 | 老旧采集实现、与来源接口强耦合、维护状态有限；不作为核心代码底座 |
| `DropsDevopsOrg/ECommerceCrawlers` | MIT；约 5.6k stars；Python/Scrapy | 通用爬虫组织、解析和工程化思路 | 多站点历史采集代码，未提供本项目所需的多租户、价格基线、通知幂等和合规边界 |
| `Ray-Yuan21/xianyu-price-tracker` | MIT；约 4 stars；HTML | 名称与价格追踪概念 | 仓库信息和实现规模不足，不具备可复用生产能力 |

### 调研结论

1. “没有开源”不成立：存在多个闲鱼/Goofish 监控项目。
2. “可以直接拿来做生产底座”也不成立：现有项目大多是个人工具，采集、登录态、UI、推送和本地存储耦合，且经常涉及浏览器自动化和账号操作。
3. 推荐路线是自建本项目的合规数据源适配层、领域模型、价格规则、队列、通知幂等和多租户 API；仅参考开源项目的 UI 交互、字段命名、事件类型、通知模板和本地开发体验。
4. 任何复制代码前必须确认仓库 LICENSE、依赖许可证、第三方资源和代码来源，并记录到 ADR；不得复制反爬绕过、验证码绕过、账号池、代理轮换或自动下单实现。

## 执行期发现（2026-08-03，FND-002）

### 本机环境约束（影响所有后续工单）

- bash 工具沙箱只允许写 workspace 与 `/tmp`；HOME（`~/`、`~/.local`）只读（EPERM）；`sudo` 被禁（Operation not permitted）。
- `/usr/local` 属 root:wheel → Homebrew 安装不可行。
- 结论：工具链与所有 npm/pnpm 状态放 workspace 内 `.toolchain/`（已 gitignore）；npm cache、pnpm store、XDG 目录经 `.toolchain/env.sh` 重定向；registry 用 npmmirror 镜像。
- git 身份通过环境变量 `GIT_AUTHOR_*/GIT_COMMITTER_*` 提供（`YYY2579` + GitHub noreply 邮箱），不写全局 config。

### TypeScript 7 / vitest 4 兼容坑

- TS7 移除 `moduleResolution: "Node"`（node10）→ 改用 NodeNext。
- `outDir/rootDir` 相对「声明处 tsconfig」解析：基线里写 `outDir: dist` 会让产物全部落到根 `dist/` → 各子包 tsconfig 必须用 `${configDir}/src`、`${configDir}/dist` 显式覆盖。
- vitest 4 为纯 ESM：CJS 产物（`dist/*.spec.js`）被默认匹配后会报 "cannot be imported in CommonJS" → 每包 `vitest.config.ts` 限定 `include: ['src/**/*.spec.ts']`。
- 版本约定：node >=24（.nvmrc=24），packageManager `pnpm@11.18.0`。

### zod 4 preprocess 嵌套坑（FND-003）

- `optional()` / `default()` 若写在 `z.preprocess(...)` **外层**，preprocess 把空串转 `undefined` 后，内部 schema 仍会报 "expected string, received undefined"。
- 必须把 `optional()` / `default()` 放进 preprocess **内部**：`z.preprocess(emptyToUndefined, z.string().min(1).optional())`，空串与未设置才能都被豁免。

### Prisma 7 关键变化（DB-001）

- **schema 中 `datasource.url` 已移除**：连接串移到 `prisma.config.ts`（`defineConfig({ schema, datasource: { url: env('DATABASE_URL') } })`）；运行时 PrismaClient 必须传 driver adapter：`new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`。
- **类型入口**：`@prisma/client` 的类型经 `default.d.ts` → `.prisma/client/index` 链导出；`InputJsonValue` 只在 `Prisma` 命名空间内（`import { Prisma } from '@prisma/client'` 后 `Prisma.InputJsonValue`），顶层不可导入。
- **错误判断**：Prisma 命名空间可能不可用，唯一约束等错误用鸭子类型判断（`'code' in err && err.code === 'P2002'`）。
- **本地 PostgreSQL 方案**：本机无 docker/sudo 时用 `embedded-postgres@16.4.0-beta.14`（npm 二进制，版本由 npm tag 决定，无 Intel macOS 的 brew bottle）；其内置 `start()` 在本沙箱不可靠，改用**原生 initdb/pg_ctl**（脚本 `packages/database/scripts/embedded-pg.mjs`）；数据目录 `/tmp/xianyu-pg`、端口 55432、账号 postgres/postgres（trust 认证）。

### pnpm 11 supply-chain 设置（DB-001）

- `onlyBuiltDependencies` 已迁移为 **`allowBuilds`**（`pnpm-workspace.yaml` 顶层映射表）；Prisma/embedded-postgres 等需要 postinstall 的包必须显式 `true`。
- **坑**：pnpm 检测到被忽略的 build 时会在 `pnpm-workspace.yaml` **自动追加占位块**（`set this to true or false`），导致 YAML 重复键报错；需手动清理占位块。
- `pnpm approve-builds` 需交互，非交互环境不可用。

### 沙箱补充约束（DB-001）

- `ps` / `pgrep` 被沙箱禁止（Operation not permitted）；进程诊断改用 `lsof`（可用）与端口 `net.connect` 探测。
- CJS 编译目标下 tsc 禁止 `import.meta`（TS1470）；vitest 测试定位包根用 `process.cwd()`。

### 集成测试基建补充（DB-002）

- **vitest 多文件共享数据库必须串行**：vitest 默认并行执行 spec 文件，两个 spec 都 `deleteMany` 清库会互相污染（user 软删除测试被 monitor 的 beforeEach 干扰失败）。`vitest.config.ts` 设 `test.fileParallelism: false` 解决。
- **Prisma Decimal 读取**：`DECIMAL(5,4)` 存储 `0.7000`，读取后 `toString()` 会去尾零（`'0.7'`）；断言用 `Number(decimal)` 或 `Decimal.equals()`。
- **prisma generate 时机**：schema 变更后必须重新 `prisma generate`，否则生成的 client 缺新模型访问器（`keywordMonitor` 不存在）。

### TS7 / monorepo 补充（COL-001）

- **TS7（tsgo）默认不自动加载 @types**：需在 tsconfig.base.json 显式 `"types": ["node"]`，否则 `node:crypto` 等内置模块报 TS2591。
- **workspace 包消费**：包的 `main/types` 指向 `dist`，上游包 import 时需先 `pnpm --filter <pkg> build` 生成 dist（开发期可用 tsc watch 或后续 vitest alias 优化）。
- **spec 相对导入**：`src/*.spec.ts` 引用自身模块用 `./index`，`src/repositories/*.spec.ts` 才用 `../index`。
- **noUncheckedIndexedAccess**：数组索引访问（`products[0]`）需非空断言 `!`。
