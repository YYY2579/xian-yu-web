# 配置运行手册

> 文档类型：参考手册（Reference）/ 操作指南（How-to）
> 适用范围：开发、测试、预发布与生产环境的所有服务（API、scheduler、worker）
> 对应工单：FND-003「建立配置与环境变量契约」

## 1. 目的

所有服务统一通过 `@xianyu/config` 包读取并校验环境变量。配置契约保证：

- 必填项缺失或类型非法时，服务启动即失败并明确列出问题字段，避免带病运行。
- 密钥、连接串等敏感值不进入日志（`toSanitized()` 脱敏）。
- 环境（development / test / staging / production）通过 `.env.<env>` 文件与默认值区分。

## 2. 快速开始（How-to）

```bash
# 1. 从样例创建本地配置（样例中所有值均为占位符）
cp .env.example .env

# 2. 修改 .env 中的 DATABASE_URL / REDIS_URL 为你的实际连接串

# 3. 校验配置契约（合法 / 缺失 / 非法类型三组场景的单元测试）
pnpm --filter @xianyu/config test
```

环境区分：创建 `.env.test`、`.env.staging` 等文件即可覆盖对应环境下的同名配置。

## 3. 配置项参考（Reference）

### 3.1 必填项

| 变量 | 类型 | 说明 |
|---|---|---|
| `DATABASE_URL` | string | PostgreSQL 连接串，格式 `postgresql://user:pass@host:port/db`。缺失时启动失败。 |
| `REDIS_URL` | string | Redis 连接串，格式 `redis://host:port`。缺失时启动失败。 |

### 3.2 通用项（带默认值）

| 变量 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `NODE_ENV` | enum | `development` | `development` / `test` / `staging` / `production`。决定 `.env.<env>` 覆盖行为。 |
| `PORT` | number | `3000` | API 监听端口，必须是正整数。 |
| `LOG_LEVEL` | enum | `info` | `debug` / `info` / `warn` / `error`。 |
| `RABBITMQ_URL` | string | 未设置 | RabbitMQ 连接串；MVP 可先使用 Redis/BullMQ，留空则队列功能不可用。 |

### 3.3 通知渠道（可选，EXT-002 凭据到位后启用）

| 变量 | 类型 | 说明 |
|---|---|---|
| `EMAIL_SMTP_HOST` | string | SMTP 服务器地址。 |
| `EMAIL_SMTP_PORT` | number | SMTP 端口，正整数。 |
| `EMAIL_SMTP_USER` | string | 发件账号。 |
| `EMAIL_SMTP_PASSWORD` | string | 发件密码（敏感，脱敏）。 |
| `EMAIL_FROM` | string | 发件人地址。 |
| `WECHAT_WEBHOOK_URL` | string | 企业微信机器人 Webhook URL，必须是合法 URL。 |

### 3.4 数据源（可选，EXT-001 授权到位后启用）

| 变量 | 类型 | 说明 |
|---|---|---|
| `DATASOURCE_AUTH_TOKEN` | string | 授权数据源访问凭据（敏感，脱敏）。 |
| `DATASOURCE_STORAGE_STATE_DIR` | string | 授权会话 storageState 受控目录，必须位于 `.gitignore` 覆盖范围（如 `runtime/storage-state`）。 |

## 4. 校验与错误行为（Reference）

- 空字符串视为未设置：`.env` 中残留的 `KEY=` 不会触发校验错误。
- 必填缺失：抛 `ConfigError`，`issues` 数组列出全部缺失字段，如
  `Invalid environment configuration: DATABASE_URL is required; REDIS_URL is required`。
- 类型非法：如 `PORT=abc` 报 `PORT must be a positive integer`；`NODE_ENV=foo` 报枚举不合法。
- 加载顺序：已有环境变量（shell/编排平台注入）优先；`.env` 其次；`.env.<NODE_ENV>` 最后覆盖。

## 5. 密钥安全

- `.env`、`.env.*` 已被 `.gitignore` 排除；样例 `.env.example` 只含占位符。
- 代码与日志禁止直接打印配置对象；使用 `toSanitized()` 后输出，凡命中
  `password` / `token` / `secret` / `url` 模式的字段一律替换为 `***`。
- 生产凭据应经密钥管理（KMS/Secret Manager）注入环境变量，而非写入 `.env` 文件。
