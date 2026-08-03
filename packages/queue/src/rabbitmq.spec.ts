import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deadLetterOf, QUEUES, RabbitMq } from './index';

// 测试依赖 docker compose 的 RabbitMQ（localhost:5672，xianyu/xianyu_dev_rabbit）
const AMQP_URL = 'amqp://xianyu:xianyu_dev_rabbit@localhost:5672';
const TEST_QUEUE = QUEUES.RAW_PRODUCT_EVENT;

let mq: RabbitMq;
const consumerTags: string[] = [];

beforeAll(async () => {
  mq = new RabbitMq(AMQP_URL);
  await mq.connect();
});

beforeEach(async () => {
  // 每个用例前清空主队列与死信队列，避免测试间残留干扰
  await mq.purge(TEST_QUEUE);
  await mq.purge(deadLetterOf(TEST_QUEUE));
});

afterEach(async () => {
  // 取消所有消费器，防止跨用例抢消息
  for (const tag of consumerTags.splice(0)) {
    await mq.cancelConsumer(tag).catch(() => {});
  }
});

afterAll(async () => {
  await mq?.close();
});

describe('RabbitMq', () => {
  it('publish -> consume（ACK 后消息被确认）', async () => {
    const received = new Promise<Record<string, unknown>>((resolve) => {
      void (async () => {
        const tag = await mq.consume<Record<string, unknown>>(TEST_QUEUE, async (message, ack) => {
          resolve(message);
          await ack();
        });
        consumerTags.push(tag);
      })();
    });

    await mq.publish(TEST_QUEUE, { hello: 'world', n: 1 });
    const message = await received;
    expect(message).toEqual({ hello: 'world', n: 1 });
  });

  it('handler 抛错时消息 requeue 重投', async () => {
    let attempts = 0;
    const done = new Promise<void>((resolve) => {
      void (async () => {
        const tag = await mq.consume<{ id: number }>(TEST_QUEUE, async (message, ack) => {
          attempts += 1;
          if (attempts >= 2) {
            // 第二次收到（重投）后成功确认
            expect(message.id).toBe(1);
            await ack();
            resolve();
            return;
          }
          throw new Error('transient failure'); // 第一次抛错 -> requeue
        });
        consumerTags.push(tag);
      })();
    });

    await mq.publish(TEST_QUEUE, { id: 1 });
    await done;
    expect(attempts).toBeGreaterThanOrEqual(2); // 至少被重投一次
  });

  it('nack(false) 将消息投入死信队列', async () => {
    const dead = new Promise<Record<string, unknown>>((resolve) => {
      void (async () => {
        const tag = await mq.consume<Record<string, unknown>>(
          deadLetterOf(TEST_QUEUE),
          async (message, ack) => {
            resolve(message);
            await ack();
          },
        );
        consumerTags.push(tag);
      })();
    });

    await mq.publish(TEST_QUEUE, { poison: true });
    // 消费主队列并 nack(false)：不重投，进入死信
    await new Promise<void>((resolve) => {
      void (async () => {
        const tag = await mq.consume<Record<string, unknown>>(
          TEST_QUEUE,
          async (_message, _ack, nack) => {
            void _ack;
            await nack(false);
            resolve();
          },
        );
        consumerTags.push(tag);
      })();
    });

    const deadMessage = await dead;
    expect(deadMessage).toEqual({ poison: true });
  });
});
