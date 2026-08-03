-- 闲鱼低价商品监控系统 - PostgreSQL 初始化脚本（FND-004）
-- 在 postgres:16 容器首次启动时执行（docker-entrypoint-initdb.d）。
-- 默认库 xianyu_dev 由 POSTGRES_DB 创建；此处额外创建测试库供集成测试使用。

CREATE DATABASE xianyu_test;
