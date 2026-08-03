import { describe, expect, it } from 'vitest';
import { DEAD_LETTER_PREFIX, deadLetterOf, QUEUES, QUEUE_TOPOLOGY } from './index';

describe('队列拓扑', () => {
  it('队列名唯一且非空', () => {
    const names = QUEUE_TOPOLOGY.map((s) => s.queue);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name.length).toBeGreaterThan(0);
  });

  it('每个队列都有 producer 与 consumer，且 retryable 为布尔', () => {
    for (const spec of QUEUE_TOPOLOGY) {
      expect(spec.producer.length).toBeGreaterThan(0);
      expect(spec.consumer.length).toBeGreaterThan(0);
      expect(typeof spec.retryable).toBe('boolean');
    }
  });

  it('覆盖采集->清洗->分析->通知全链路', () => {
    expect(QUEUE_TOPOLOGY.map((s) => s.queue)).toEqual(
      expect.arrayContaining([
        QUEUES.COLLECT_JOB,
        QUEUES.RAW_PRODUCT_EVENT,
        QUEUES.PRODUCT_OBSERVED_EVENT,
        QUEUES.LOW_PRICE_DETECTED_EVENT,
        QUEUES.NOTIFICATION_COMMAND,
      ]),
    );
    // 链路衔接正确
    expect(QUEUE_TOPOLOGY.find((s) => s.queue === QUEUES.RAW_PRODUCT_EVENT)?.producer).toBe('collector-worker');
    expect(QUEUE_TOPOLOGY.find((s) => s.queue === QUEUES.RAW_PRODUCT_EVENT)?.consumer).toBe('processor-worker');
  });

  it('死信队列命名约定', () => {
    expect(DEAD_LETTER_PREFIX).toBe('dlq');
    expect(deadLetterOf(QUEUES.RAW_PRODUCT_EVENT)).toBe('dlq.raw-product-event');
  });
});
