/**
 * 队列拓扑（COL-001）
 *
 * MVP 采用"每链路一队列 + 死信"的简单拓扑；生产者/消费者映射表为
 * 后续 RabbitMQ 声明或 BullMQ 定义提供单一事实来源。
 */

export const QUEUES = {
  /** 调度器 -> 采集 worker */
  COLLECT_JOB: 'collect-job',
  /** 采集 worker -> 清洗 worker */
  RAW_PRODUCT_EVENT: 'raw-product-event',
  /** 清洗 worker -> 分析 worker */
  PRODUCT_OBSERVED_EVENT: 'product-observed-event',
  /** 分析 worker -> 通知 worker */
  LOW_PRICE_DETECTED_EVENT: 'low-price-detected-event',
  /** 通知投递命令（渠道渲染后投递） */
  NOTIFICATION_COMMAND: 'notification-command',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const DEAD_LETTER_PREFIX = 'dlq';

/** 死信队列名：dlq.<原队列名> */
export function deadLetterOf(queue: QueueName): string {
  return `${DEAD_LETTER_PREFIX}.${queue}`;
}

export type QueueSpec = {
  queue: QueueName;
  /** 生产方服务标识（scheduler / collector-worker / ...） */
  producer: string;
  /** 消费方服务标识 */
  consumer: string;
  /** 是否支持失败重试（永久失败进入死信） */
  retryable: boolean;
};

export const QUEUE_TOPOLOGY: readonly QueueSpec[] = [
  {
    queue: QUEUES.COLLECT_JOB,
    producer: 'scheduler',
    consumer: 'collector-worker',
    retryable: true,
  },
  {
    queue: QUEUES.RAW_PRODUCT_EVENT,
    producer: 'collector-worker',
    consumer: 'processor-worker',
    retryable: true,
  },
  {
    queue: QUEUES.PRODUCT_OBSERVED_EVENT,
    producer: 'processor-worker',
    consumer: 'analyzer-worker',
    retryable: true,
  },
  {
    queue: QUEUES.LOW_PRICE_DETECTED_EVENT,
    producer: 'analyzer-worker',
    consumer: 'notifier-worker',
    retryable: true,
  },
  {
    queue: QUEUES.NOTIFICATION_COMMAND,
    producer: 'notifier-worker',
    consumer: 'notifier-worker',
    retryable: true,
  },
];
