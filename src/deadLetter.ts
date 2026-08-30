import fs from 'fs/promises';
import { config } from './config';

export class DeadLetter {
  private file: string;

  constructor(filePath?: string) {
    this.file = filePath || config.deadLetterFile;
  }

  async append(entry: any): Promise<void> {
    await fs.appendFile(this.file, JSON.stringify(entry) + '\n');
    await this.rotateIfNeeded();
  }

  private async rotateIfNeeded(): Promise<void> {
    try {
      const stat = await fs.stat(this.file);
      if (stat.size > 10 * 1024 * 1024) { 
        const newName = `${this.file}.${Date.now()}.rotated`;
        await fs.rename(this.file, newName);
        console.log(`Dead letter file rotated to ${newName}`);
      }
    } catch (err) {
    }
  }
}