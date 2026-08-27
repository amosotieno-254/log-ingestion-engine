
export interface PendingLog {
  log: any;         
  sourceIp: string; 
}

export class RawLogChannel {
  private queue: PendingLog[] = [];
  private bufferSize: number;

  constructor(bufferSize: number) {
    this.bufferSize = bufferSize;
  }

  // Push a log; return false if queue full (non-blocking)
  push(item: PendingLog): boolean {
    if (this.queue.length >= this.bufferSize) {
      return false;
    }
    this.queue.push(item);
    return true;
  }

  // Pop up to batchSize items, waiting up to timeoutMs if queue is empty
  async popBatch(batchSize: number, timeoutMs: number): Promise<PendingLog[]> {
    const start = Date.now();
    while (this.queue.length === 0 && (Date.now() - start) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 5)); // small sleep
    }
    return this.queue.splice(0, Math.min(batchSize, this.queue.length));
  }

  get length(): number {
    return this.queue.length;
  }
}