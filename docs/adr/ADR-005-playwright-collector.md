# ADR-005：采用 Playwright 作为采集执行层

- 状态：Accepted
- 日期：2026-08-03
- 决策人：项目技术负责人

## 背景

项目需要监控授权数据源中的商品搜索结果。现有开源项目大多使用浏览器自动化，但采集实现与页面、登录态和通知强耦合。项目同时需要可替换的数据源接口、多租户隔离、队列重试和可审计的商品事件。

## 决策

采用 Playwright 作为一个数据源适配器的执行层：

- Playwright 负责 Browser、BrowserContext、Page、页面事件、DOM/响应读取和测试。
- `datasource-sdk` 定义统一的 `search()`、`healthCheck()`、`close()` 和错误分类接口。
- 采集适配器只输出 `RawProductEvent`，不能直接写业务数据库或发送通知。
- 调度、配额、重试和熔断由平台服务统一控制。
- 任何真实账号或登录态都必须是明确授权的数据源凭据，并使用受控密钥存储。

## Playwright 使用约束

### 允许

- 在授权的浏览器数据源中打开页面并读取商品列表。
- 使用独立 BrowserContext 隔离任务。
- 使用 `storageState` 保存和加载经授权的会话状态。
- 使用稳定定位器、`evaluateAll` 或已验证的响应解析器提取字段。
- 使用 route 阻止非必要静态资源，或在测试中 mock 网络响应。
- 使用 timeout、有限重试、trace 和截图进行故障诊断。

### 禁止

- 验证码绕过、指纹伪装、代理池/账号池轮换或签名逆向。
- 通过 Playwright 执行自动下单、支付、抢拍或批量强聊。
- 以无限重试或高并发方式对抗数据源风控。
- 在日志、Git 或普通业务表中保存 Cookie、Token、完整登录态或不必要的个人信息。

## 结果

该决策保留 Playwright 的浏览器兼容性、会话隔离和 E2E 能力，同时让上层业务不依赖具体页面结构。未来可以增加官方 API 或合作数据源适配器，而无需重写价格分析和通知链路。

## 参考文档

- [Playwright 官方文档](https://playwright.dev/)
- [BrowserContext storageState](https://playwright.dev/docs/auth)
- [Playwright Locators](https://playwright.dev/docs/locators)
- [Playwright Network](https://playwright.dev/docs/network)
- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer)
