// NEW: dead letter file handler with rotation
import fs from 'fs/promises';
import { config } from './config';

export class DeadLetter {
  private file = config.deadLetterFile;

  async append(entry: any): Promise<void> {
    await fs.appendFile(this.file, JSON.stringify(entry) + '\n');
    await this.rotateIfNeeded();
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      const stat = await fs.stat(this.file);
      if (stat.size > 10 * 1024 * 1024) { // 10 MB
        const newName = `logs-failed-${Date.now()}.json`;
        await fs.rename(this.file, newName);
        console.log(`Dead letter file rotated to ${newName}`);
      }
    } catch (err) {
    }
  }
}