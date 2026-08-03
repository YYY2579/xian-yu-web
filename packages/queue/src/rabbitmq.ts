import amqp, { type Channel, type ChannelModel } from 'amqplib';
import { deadLetterOf, QUEUE_TOPOLOGY } from './topology';

/**
 * RabbitMQ 封装（PROC-005 / queue 包）
 * - 按 QUEUE_TOPOLOGY 声明全部队列（durable）并绑定死信队列。
 * - publish 持久化消息；consume 需显式 ACK/NACK（处理成功后才确认）。
 */

export type ConsumeHandler<T> = (
  message: T,
  ack: () => Promise<void>,
  nack: (requeue: boolean) => Promise<void>,
) => Promise<void>;

export class RabbitMq {
  private connection?: ChannelModel;
  private channel?: Channel;

  constructor(private readonly url: string) {}

  async connect(): Promise<void> {
    this.connection = await amqp.connect(this.url);
    this.channel = await this.connection.createChannel();
    await this.declare();
  }

  private async declare(): Promise<void> {
    const channel = this.assertChannel();
    for (const spec of QUEUE_TOPOLOGY) {
      // 主队列：死信投递到 dlq.<queue>
      await channel.assertQueue(spec.queue, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': deadLetterOf(spec.queue),
        },
      });
      await channel.assertQueue(deadLetterOf(spec.queue), { durable: true });
    }
  }

  async publish<T>(queue: string, message: T): Promise<void> {
    const channel = this.assertChannel();
    const ok = channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
    });
    if (!ok) {
      // 背压：等待 drain
      await new Promise<void>((resolve) => channel.once('drain', () => resolve()));
    }
  }

  /**
   * 消费消息：handler 抛错时自动 NACK（requeue=true 可重试）；
   * 明确调用 nack(false) 可进入死信。返回 consumerTag 供取消。
   */
  async consume<T>(queue: string, handler: ConsumeHandler<T>): Promise<string> {
    const channel = this.assertChannel();
    const { consumerTag } = await channel.consume(queue, async (raw) => {
      if (!raw) return;
      const ack = async () => {
        channel.ack(raw);
      };
      const nack = async (requeue: boolean) => {
        channel.nack(raw, false, requeue);
      };
      try {
        const message = JSON.parse(raw.content.toString()) as T;
        await handler(message, ack, nack);
      } catch {
        // 默认 requeue=true 重试；由 handler 决定是否 nack(false) 进死信
        await nack(true);
      }
    });
    return consumerTag;
  }

  /** 取消某个消费者（测试或优雅停机用） */
  async cancelConsumer(consumerTag: string): Promise<void> {
    await this.assertChannel().cancel(consumerTag);
  }

  /** 清空单个队列（测试用） */
  async purge(queue: string): Promise<void> {
    await this.assertChannel().purgeQueue(queue);
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  private assertChannel(): Channel {
    if (!this.channel) throw new Error('RabbitMQ not connected; call connect() first');
    return this.channel;
  }
}
