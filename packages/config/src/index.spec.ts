import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, toSanitized } from './index';

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:secret@localhost:5432/xianyu_test',
  REDIS_URL: 'redis://localhost:6379',
} as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('合法配置全部通过，默认值生效', () => {
    const cfg = loadConfig(baseEnv, { loadDotEnv: false });
    expect(cfg.NODE_ENV).toBe('test');
    expect(cfg.DATABASE_URL).toContain('postgresql://');
    expect(cfg.REDIS_URL).toBe('redis://localhost:6379');
    expect(cfg.PORT).toBe(3000); // 默认端口
    expect(cfg.LOG_LEVEL).toBe('info'); // 默认日志级别
    expect(cfg.RABBITMQ_URL).toBeUndefined(); // 可选字段未设置
    expect(cfg.DATASOURCE_AUTH_TOKEN).toBeUndefined();
  });

  it('缺少必填配置时抛出 ConfigError 并列出全部缺失字段', () => {
    const missing = { NODE_ENV: 'test' } as NodeJS.ProcessEnv;
    try {
      loadConfig(missing, { loadDotEnv: false });
      expect.unreachable('应抛出 ConfigError');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      const issues = (err as ConfigError).issues.join('; ');
      expect(issues).toContain('DATABASE_URL');
      expect(issues).toContain('REDIS_URL');
    }
  });

  it('非法类型（PORT 非数字）报错', () => {
    expect(() =>
      loadConfig({ ...baseEnv, PORT: 'abc' } as NodeJS.ProcessEnv, { loadDotEnv: false }),
    ).toThrowError(ConfigError);
  });

  it('非法 NODE_ENV 报错', () => {
    expect(() =>
      loadConfig({ ...baseEnv, NODE_ENV: 'foo' } as NodeJS.ProcessEnv, { loadDotEnv: false }),
    ).toThrowError(/NODE_ENV/);
  });

  it('空字符串视为未设置，不报错', () => {
    const cfg = loadConfig(
      { ...baseEnv, RABBITMQ_URL: '', EMAIL_SMTP_PASSWORD: '', WECHAT_WEBHOOK_URL: '' } as NodeJS.ProcessEnv,
      { loadDotEnv: false },
    );
    expect(cfg.RABBITMQ_URL).toBeUndefined();
    expect(cfg.EMAIL_SMTP_PASSWORD).toBeUndefined();
    expect(cfg.WECHAT_WEBHOOK_URL).toBeUndefined();
  });

  it('可选字段合法值被保留；非法 URL 报错', () => {
    const cfg = loadConfig(
      {
        ...baseEnv,
        RABBITMQ_URL: 'amqp://guest:guest@localhost:5672',
        WECHAT_WEBHOOK_URL: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc',
      } as NodeJS.ProcessEnv,
      { loadDotEnv: false },
    );
    expect(cfg.RABBITMQ_URL).toBe('amqp://guest:guest@localhost:5672');
    expect(cfg.WECHAT_WEBHOOK_URL).toContain('qyapi.weixin.qq.com');

    expect(() =>
      loadConfig({ ...baseEnv, WECHAT_WEBHOOK_URL: 'not-a-url' } as NodeJS.ProcessEnv, {
        loadDotEnv: false,
      }),
    ).toThrowError(/WECHAT_WEBHOOK_URL/);
  });
});

describe('toSanitized', () => {
  it('敏感字段脱敏为 ***，非敏感字段保留原文', () => {
    const cfg = loadConfig(
      {
        ...baseEnv,
        EMAIL_SMTP_PASSWORD: 'smtp-secret-123',
        DATASOURCE_AUTH_TOKEN: 'token-abc',
      } as NodeJS.ProcessEnv,
      { loadDotEnv: false },
    );
    const sanitized = toSanitized(cfg);
    expect(sanitized.EMAIL_SMTP_PASSWORD).toBe('***');
    expect(sanitized.DATASOURCE_AUTH_TOKEN).toBe('***');
    expect(sanitized.DATABASE_URL).toBe('***'); // 连接串含凭据，同样脱敏
    expect(sanitized.NODE_ENV).toBe('test'); // 非敏感字段保留
    expect(sanitized.PORT).toBe('3000');

    const json = JSON.stringify(sanitized);
    expect(json).not.toContain('smtp-secret-123');
    expect(json).not.toContain('token-abc');
    expect(json).not.toContain('postgresql://');
  });
});
