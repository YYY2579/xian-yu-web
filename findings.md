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
