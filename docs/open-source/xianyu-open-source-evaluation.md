# 闲鱼低价监控系统开源方案评估

> 调研日期：2026-08-03  
> 目的：判断是否直接复用开源项目，确定 Playwright 采集层的落地方式。

## 1. 结论

有相关开源项目，但没有一个项目适合原样作为本系统的生产底座。推荐方案：

1. **自建业务框架**：沿用本项目已确定的 TypeScript/NestJS/React/PostgreSQL/Redis/消息队列分层。
2. **采用 Playwright 作为浏览器采集执行层**：通过数据源适配器封装，隔离页面选择器、会话状态和来源字段。
3. **参考开源项目的领域经验**：任务管理、去重、价格历史、收藏降价事件、通知渠道、运行日志和本地部署体验。
4. **不直接复制高风险实现**：验证码/风控绕过、账号池、代理轮换、逆向签名、自动下单、抢拍和批量账号操作。

“0-1 写框架”不是重复造轮子，而是为了掌握多租户、数据模型、价格规则、通知幂等、可观测性和合规边界这些现有个人脚本通常没有覆盖的生产能力。

## 2. 重点仓库

| 项目 | 链接 | 公开信息 | 可借鉴内容 | 主要限制 | 建议 |
|---|---|---|---|---|---|
| `Usagi-org/ai-goofish-monitor` | [GitHub](https://github.com/Usagi-org/ai-goofish-monitor) | MIT；约 14.1k stars；Python/FastAPI/Playwright/React/SQLite/Docker | 任务管理、AI 筛选、价格历史、运行日志、多渠道通知、Docker 体验 | 账号登录态、Playwright 页面采集、代理/账号轮换与核心业务强耦合；默认 SQLite | 重点参考产品交互和领域字段，不直接作为生产底座 |
| `tristanwqy/GooFish-AIMonitor` | [GitHub](https://github.com/tristanwqy/GooFish-AIMonitor) | MIT；约 17 stars；Python/FastAPI/Playwright/React/SQLite/Docker | 收藏降价/售罄事件、事件流、设置中心、本地数据边界 | 以本地单机和浏览器登录为中心，不是多租户系统 | 参考事件类型和本地安全设计 |
| `voltwake/xianyu-monitor` | [GitHub](https://github.com/voltwake/xianyu-monitor) | MIT；约 38 stars；Node/Puppeteer/SQLite | 关键词、价格/地区/排除词、去重、Discord/Telegram 推送 | macOS/Chrome/AppleScript/OpenClaw 依赖；采集和定时逻辑耦合 | 参考最小通知闭环，不复制运行方式 |
| `bytesFighting/idlefish_xianyu_spider-crawler-sender` | [GitHub](https://github.com/bytesFighting/idlefish_xianyu_spider-crawler-sender) | MIT；约 296 stars；历史维护项目 | 筛选、队列、钉钉推送、风控暂停的领域经验 | 采集实现较旧、来源接口耦合、工程边界不适合本项目 | 只参考历史经验和故障处理思路 |
| `DropsDevopsOrg/ECommerceCrawlers` | [GitHub](https://github.com/DropsDevopsOrg/ECommerceCrawlers) | MIT；约 5.6k stars；Python/Scrapy | 通用爬虫组织、解析和工程化思路 | 多站点历史脚本，缺少本项目的多租户/价格基线/通知幂等 | 仅参考通用爬虫组织方式 |
| `Ray-Yuan21/xianyu-price-tracker` | [GitHub](https://github.com/Ray-Yuan21/xianyu-price-tracker) | MIT；约 4 stars；HTML | 价格追踪概念 | 实现规模和公开信息不足 | 不作为依赖 |

> Stars、更新时间和描述来自 GitHub 公开仓库元数据；使用前仍需复核仓库当前 LICENSE、依赖许可证、第三方资源和实际代码版本。

## 3. 为什么不直接 Fork

### 3.1 架构不匹配

多数项目是单机工具：浏览器登录态 + 一个进程 + SQLite + 本地文件 + 通知。目标系统需要：

- 多用户、多任务和权限隔离。
- API、调度、采集、清洗、分析、通知解耦。
- PostgreSQL 事务存储、Redis 缓存和队列重试。
- 规则版本、市场价基线和完整审计。
- 独立扩缩容、监控和上线回滚。

### 3.2 合规边界不一致

部分项目 README 明确描述了登录态导入、非 headless 浏览器、账号/代理轮换、反风控或自动化操作。即使仓库有 MIT 许可证，也不代表这些操作符合数据来源平台协议或适合本项目商用。

许可证只解决代码授权问题，不解决数据访问授权、平台协议、个人信息处理和第三方服务合规问题。

### 3.3 维护与供应链风险

- 依赖可能没有锁定或已过时。
- 采集选择器和页面结构变化会导致运行时故障。
- 隐藏的默认账号、调试接口或敏感数据落盘风险。
- 复制代码后难以追踪上游修复和许可证变化。

## 4. Playwright 采用方式

Playwright 作为 `datasource-sdk` 的一个执行实现，而不是让业务模块直接调用 Playwright。

```text
Scheduler
  -> CollectorJob
    -> PlaywrightSourceAdapter
      -> BrowserContext / Page
        -> RawProductEvent
          -> Processor -> Analyzer -> Notifier
```

### 4.1 会话隔离

- 每个采集任务使用独立 BrowserContext，避免任务之间共享页面状态。
- 若业务确实需要用户授权登录，使用 Playwright `storageState` 保存和加载会话；文件必须进入密钥/隐私存储，不能提交到 Git。
- 默认不把登录态、Cookie、localStorage 或个人信息写入商品表。
- 任务失败、会话过期和数据源拒绝访问必须可观测，并支持人工停用来源。

### 4.2 页面读取

- 使用稳定的语义定位器和页面契约测试；避免把大量 CSS 选择器散落在业务代码。
- 商品解析封装为纯函数：页面 DOM/响应快照 -> RawProductEvent。
- 使用有限超时、明确重试和 trace；不通过无限重试掩盖风控或页面变化。
- 页面截图、trace 和原始响应只在测试或故障排查时短期保留，并执行脱敏。

### 4.3 网络与资源控制

- 可以使用 Playwright route 阻止不必要的图片/字体等资源，以降低测试和采集成本，但不得修改业务请求来绕过来源限制。
- 采集频率、并发数、重试次数和会话数量由调度器/配额服务统一控制。
- 禁止实现验证码绕过、指纹伪装、代理池轮换、签名逆向、账号池和自动下单。

### 4.4 测试策略

- 使用本地 HTML/JSON fixture 验证解析器，不把 CI 绑定到真实闲鱼页面。
- 使用 Playwright API mocking 或 route fulfill 测试异常响应和页面变化。
- 使用 trace、截图和失败上下文诊断 E2E；CI 默认不使用真实用户登录态。

## 5. 复用决策表

| 内容 | 是否复用 | 处理方式 |
|---|---|---|
| UI 交互、任务字段和通知模板 | 可以 | 参考设计，重新实现并记录来源 |
| 价格历史和收藏降价事件的领域概念 | 可以 | 转换为本项目事件模型并补充测试 |
| 通用 Playwright 封装 | 谨慎 | 只复制许可证清晰、无高风险行为的通用代码 |
| 页面选择器和字段解析 | 谨慎 | 仅在授权场景下参考；必须放入适配器和 fixture 测试 |
| 登录态导入、账号池、代理轮换 | 不复用 | 重新做合规评审；默认禁止 |
| 验证码/风控绕过、逆向签名 | 不复用 | 明确禁止 |
| 自动下单、抢拍、强聊 | 不复用 | 不在产品范围内 |

## 6. 使用前检查

1. 锁定具体 commit，而不是直接跟随默认分支。
2. 保存 LICENSE、NOTICE 和依赖许可证清单。
3. 做静态安全扫描和秘密扫描。
4. 逐个审查账号、Cookie、代理、网络请求和文件落盘路径。
5. 将任何复用代码记录到 `docs/adr/`，注明来源、commit、许可证和修改内容。
6. 通过产品、法务和安全评审后，才允许进入生产镜像。
