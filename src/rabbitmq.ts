import amqp from "amqplib";
import {config} from "./config"

export class RabbitMQClient {
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private connected = false;
  private localQueues = new Map<string, any[]>();

  constructor() {
    for (const service of config.services) {
      this.localQueues.set(service, []);
    }
  }

  async connect(): Promise<void> {
    try {
      const { host, port, user, pass } = config.rabbitmq;
      this.connection = await amqp.connect({
        hostname: host,
        port,
        username: user,
        password: pass,
      });
      this.channel = await this.connection.createChannel();
      await this.createExchangesAndQueues();
      await this.startListeningToQueues();
      this.connected = true;
      console.log("Connected to RabbitMQ");
    } catch (err) {
      console.warn("RabbitMQ unavailable, using in-memory fallback", err);
      this.connected = false;
    }
  }

  private async createExchangesAndQueues(): Promise<void> {
    if (!this.channel) return;
    for (const service of config.services) {
      const exchangeName = `exchange_${service}`;
      const queueName = `queue_${service}`;
      await this.channel.assertExchange(exchangeName, "direct", {
        durable: true,
      });
      await this.channel.assertQueue(queueName, { durable: true });
      await this.channel.bindQueue(queueName, exchangeName, "log.write");
    }
  }

  private async startListeningToQueues(): Promise<void> {
    if (!this.channel) return;
    for (const service of config.services) {
      const queueName = `queue_${service}`;
      await this.channel.consume(queueName, (msg) => {
        if (msg) {
          try {
            const log = JSON.parse(msg.content.toString());
            const arr = this.localQueues.get(service) || [];
            arr.push(log);
            this.localQueues.set(service, arr);
            this.channel!.ack(msg);
          } catch (err) {
            console.error("Failed to parse message", err);
            this.channel!.nack(msg, false, false);
          }
        }
      });
    }
  }

  async publish(service: string, log: any): Promise<void> {
    if (!this.connected || !this.channel) {
      const arr = this.localQueues.get(service) || [];
      arr.push(log);
      this.localQueues.set(service, arr);
      return;
    }

    const exchangeName = `exchange_${service}`;
    try {
      await Promise.race([
        this.channel.publish(
          exchangeName,
          "log.write",
          Buffer.from(JSON.stringify(log)),
          { persistent: true },
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("publish timeout")), 5000),
        ),
      ]);
    } catch (err) {
      console.error(
        `RabbitMQ publish failed for ${service}, falling back`,
        err,
      );
      const arr = this.localQueues.get(service) || [];
      arr.push(log);
      this.localQueues.set(service, arr);
    }
  }

  // Called by storage consumers to get a batch of logs for a service
  async popBatch(
    service: string,
    batchSize: number,
    timeoutMs: number,
  ): Promise<any[]> {
    const start = Date.now();
    const queue = this.localQueues.get(service) || [];
    while (queue.length === 0 && Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return queue.splice(0, Math.min(batchSize, queue.length));
  }

  getBacklogSize(): number {
    let total = 0;
    for (const arr of this.localQueues.values()) {
      total += arr.length;
    }
    return total;
  }
}
