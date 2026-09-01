// NEW: SQLite writer with prepared statements
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from './config';

export class SQLiteWriter {
  private db: sqlite3.Database;
  private insertStmt: sqlite3.Statement;

  constructor(service: string) {
    const dir = config.sqliteDir;
    fs.mkdirSync(dir, { recursive: true });
    const dbPath = path.join(dir, `logs_${service}.db`);
    this.db = new sqlite3.Database(dbPath);
    this.db.serialize(() => {
      this.db.run(`
        CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          service TEXT NOT NULL,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          received_at TEXT NOT NULL,
          source_ip TEXT NOT NULL,
          env TEXT NOT NULL
        )
      `);
    });
    this.insertStmt = this.db.prepare(`
      INSERT INTO logs (timestamp, service, level, message, received_at, source_ip, env)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
  }

  async writeBatch(logs: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');
        for (const log of logs) {
          this.insertStmt.run(
            log.timestamp,
            log.service,
            log.level,
            log.message,
            log.received_at,
            log.source_ip,
            log.env
          );
        }
        this.db.run('COMMIT', (errors) => {
          if (errors) {
            this.db.run('ROLLBACK');
            reject(errors);
          } else {
            resolve();
          }
        });
      });
    });
  }

  close(): void {
    this.db.close();
  }
}