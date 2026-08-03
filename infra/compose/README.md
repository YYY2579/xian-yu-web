# 本地 Docker Compose 基础设施

> 文档类型：操作指南（How-to）
> 对应工单：FND-004「建立本地 Docker Compose 基础设施」

## 1. 目的

一条命令启动 MVP 所需的三项基础设施（PostgreSQL 16 / Redis 7 / RabbitMQ 3-management），
供 API、scheduler 与各 worker 在本地开发、联调和集成测试使用。

## 2. 快速开始

```bash
# 1. （可选）在 .env 中覆盖开发密码（默认值见下表）
cp .env.example .env

# 2. 启动并等待全部容器健康（-d 后台；--wait 等待 healthcheck）
docker compose up -d --wait

# 3. 查看状态
docker compose ps

# 4. 停止（保留数据卷）
docker compose down
# 完全清理（删除数据卷）
docker compose down -v
```

## 3. 连接信息

| 服务 | 地址 | 端口 | 默认账号 | 默认密码 | 健康检查 |
|---|---|---|---|---|---|
| PostgreSQL | `localhost` | 5432 | `xianyu` | `xianyu_dev_password` | `pg_isready` |
| Redis | `localhost` | 6379 | - | `xianyu_dev_redis` | `redis-cli ping` |
| RabbitMQ | `localhost` | 5672 (AMQP) / 15672 (管理台) | `xianyu` | `xianyu_dev_rabbit` | `rabbitmq-diagnostics ping` |

管理台：<http://localhost:15672>（账号 `xianyu`）。

## 4. 与配置契约（FND-003）的对应关系

```dotenv
DATABASE_URL=postgresql://xianyu:xianyu_dev_password@localhost:5432/xianyu_dev
REDIS_URL=redis://:xianyu_dev_redis@localhost:6379
RABBITMQ_URL=amqp://xianyu:xianyu_dev_rabbit@localhost:5672
```

集成测试库：`xianyu_test`（由 `infra/compose/postgres/init.sql` 在首次启动时创建）。

## 5. 密码策略

- 默认密码仅限本地开发；通过 `.env` 中 `POSTGRES_PASSWORD` / `REDIS_PASSWORD` /
  `RABBITMQ_PASSWORD` 覆盖，无需修改 compose 文件。
- 生产环境必须使用密钥管理（KMS/Secret Manager）注入，禁止沿用默认值。

## 6. 验证（CI）

本仓库 CI 在 ubuntu runner 上执行 `docker compose up -d --wait` 并断言三个服务全部
healthy（见 `.github/workflows/ci.yml` 的 `infra` job），弥补本地无 Docker 时的验收缺口。
