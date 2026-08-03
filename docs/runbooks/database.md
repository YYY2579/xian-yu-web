# 数据库运行手册

> 文档类型：操作指南（How-to）/ 参考（Reference）
> 对应工单：DB-005「完成数据库索引、迁移和种子策略」

## 1. 目的

提供 PostgreSQL 数据库从零初始化、升级、播种与查询验证的标准操作，
确保本地、测试与预发布环境数据库一致可复现。

## 2. 前置

- PostgreSQL 实例可达（docker compose 的 postgres 或嵌入式 PG）。
- 设置 `DATABASE_URL`（格式见 `docs/runbooks/configuration.md`）。
- 工作目录：`packages/database`。

## 3. 快速开始（How-to）

```bash
cd packages/database

# 1. 迁移（幂等：空库从零建表，已有库只应用未执行的迁移，不丢数据）
DATABASE_URL=postgres://xianyu:pass@localhost:5432/xianyu_dev pnpm db:migrate

# 2. 播种测试数据（仅 test/development 环境；生产环境拒绝执行）
DATABASE_URL=postgres://xianyu:pass@localhost:5432/xianyu_test pnpm db:seed

# 3. 验证
DATABASE_URL=... pnpm exec prisma studio   # 或直接 psql 查询
```

## 4. 迁移策略（Reference）

| 场景 | 命令 | 行为 |
|---|---|---|
| 空数据库从零初始化 | `pnpm db:migrate` | `prisma migrate deploy` 依次应用全部迁移 |
| 已存在数据升级 | `pnpm db:migrate` | 只应用未执行的迁移；不重建表、不丢数据 |
| 开发中生成新迁移 | `pnpm exec prisma migrate dev --name <name>` | 生成迁移并应用（连接开发库） |
| 只生成不应用（手改 SQL 如扩展） | `... --create-only` 后编辑 migration.sql，再 `deploy` | 如 pg_trgm 索引迁移 |

迁移记录存于 `_prisma_migrations` 表；所有迁移文件在
`packages/database/prisma/migrations/`，随代码提交（不可修改已应用的历史迁移）。

## 5. 索引与查询（Reference）

主要索引：

| 表 | 索引 | 用途 |
|---|---|---|
| users | `users_email_key`（唯一）、`idx_users_plan_status` | 登录、套餐查询 |
| keyword_monitors | `idx_monitors_user_status`、`idx_monitors_status_next_run`、`idx_monitors_normalized_keyword` | 调度选任务、用户查询 |
| products | `products_canonical_key_key`（唯一）、`idx_products_source_prod`、`idx_products_normalized_title_trgm` | 去重、标题模糊检索 |
| product_price_history | `source_event_id`（唯一）、`idx_ph_product_observed`、`idx_ph_observed_at` | 幂等、价格序列查询 |
| notification_records | `idempotency_key`（唯一）、`idx_notif_user_created` 等 | 幂等、历史查询 |

标题模糊检索使用 `pg_trgm` 扩展的 GIN 索引（`idx_products_normalized_title_trgm`）。
注意：小表上优化器可能选择 Seq Scan（正常），数据量增大后自动使用索引。

## 6. 种子数据（Reference）

- `pnpm db:seed` 仅允许 `NODE_ENV=test` / `development`；生产环境直接拒绝。
- 种子内容：用户、监控任务、商品、价格历史、通知记录（幂等：先清空业务表再写入）。
- 种子只用于本地联调与测试，绝不包含真实用户数据或凭据。

## 7. 验证清单（Checklist）

- [ ] 空库 `pnpm db:migrate` 后表数量与 `_prisma_migrations` 一致（当前 8 表 / 5 迁移）。
- [ ] 已有库重复执行 `pnpm db:migrate` 输出 "No pending migrations"。
- [ ] `SELECT extname FROM pg_extension WHERE extname='pg_trgm'` 返回 pg_trgm。
- [ ] `pnpm db:seed` 在 test 环境生成种子；production 环境拒绝。
