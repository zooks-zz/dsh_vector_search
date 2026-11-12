import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { bytesToF32, f32ToBytes } from "./vector.js";

type Statement = ReturnType<DatabaseSync["prepare"]>;

export interface EntryRow {
  source: string;
  entry: string;
  vector: Float32Array;
}

interface EntryRowRaw {
  source: string;
  entry: string;
  vector: Uint8Array;
}

interface PayloadRowRaw {
  payload: string;
}

// 与 SQLite 打交道：建表、CRUD、事务。向量以 Float32Array 进/出，字节编码细节封装在 vector.ts。
export class Storage {
  private db: DatabaseSync;
  private stmtInsertEntry!: Statement;
  private stmtSourceExists!: Statement;
  private stmtLoadEntries!: Statement;
  private stmtListSourceEntries!: Statement;
  private stmtDeleteEntries!: Statement;
  private stmtUpsertPayload!: Statement;
  private stmtDeletePayload!: Statement;
  private stmtGetPayload!: Statement;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.initSchema();
  }

  close(): void {
    this.db.close();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS source_entries (
        id     INTEGER PRIMARY KEY AUTOINCREMENT,
        app    TEXT NOT NULL,
        source TEXT NOT NULL,
        entry  TEXT NOT NULL,
        vector BLOB NOT NULL,
        UNIQUE(app, source, entry)
      );
      CREATE INDEX IF NOT EXISTS idx_entries_app ON source_entries(app);
      CREATE TABLE IF NOT EXISTS source_payloads (
        app     TEXT NOT NULL,
        source  TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (app, source)
      );
    `);
    this.stmtInsertEntry = this.db.prepare(
      "INSERT INTO source_entries (app, source, entry, vector) VALUES (?, ?, ?, ?)"
    );
    this.stmtSourceExists = this.db.prepare(
      "SELECT 1 AS one FROM source_entries WHERE app = ? AND source = ? LIMIT 1"
    );
    this.stmtLoadEntries = this.db.prepare(
      "SELECT source, entry, vector FROM source_entries WHERE app = ?"
    );
    this.stmtListSourceEntries = this.db.prepare(
      "SELECT entry FROM source_entries WHERE app = ? AND source = ? ORDER BY id"
    );
    this.stmtDeleteEntries = this.db.prepare(
      "DELETE FROM source_entries WHERE app = ? AND source = ?"
    );
    this.stmtUpsertPayload = this.db.prepare(
      "INSERT INTO source_payloads (app, source, payload) VALUES (?, ?, ?) ON CONFLICT(app, source) DO UPDATE SET payload = excluded.payload"
    );
    this.stmtDeletePayload = this.db.prepare(
      "DELETE FROM source_payloads WHERE app = ? AND source = ?"
    );
    this.stmtGetPayload = this.db.prepare(
      "SELECT payload FROM source_payloads WHERE app = ? AND source = ?"
    );
  }

  // 同步事务：fn 内的写操作要么全成、要么全回滚。
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  sourceExists(app: string, source: string): boolean {
    return this.stmtSourceExists.get(app, source) !== undefined;
  }

  insertEntry(app: string, source: string, entry: string, vector: Float32Array): void {
    this.stmtInsertEntry.run(app, source, entry, f32ToBytes(vector));
  }

  loadEntries(app: string): EntryRow[] {
    const rows = this.stmtLoadEntries.all(app) as unknown as EntryRowRaw[];
    return rows.map((r) => ({ source: r.source, entry: r.entry, vector: bytesToF32(r.vector) }));
  }

  listSourceEntries(app: string, source: string): string[] {
    const rows = this.stmtListSourceEntries.all(app, source) as unknown as { entry: string }[];
    return rows.map((r) => r.entry);
  }

  deleteEntries(app: string, source: string): void {
    this.stmtDeleteEntries.run(app, source);
  }

  upsertPayload(app: string, source: string, payload: unknown): void {
    this.stmtUpsertPayload.run(app, source, JSON.stringify(payload));
  }

  deletePayload(app: string, source: string): void {
    this.stmtDeletePayload.run(app, source);
  }

  getPayload(app: string, source: string): unknown {
    const row = this.stmtGetPayload.get(app, source) as PayloadRowRaw | undefined;
    if (row === undefined) return null;
    try {
      return JSON.parse(row.payload);
    } catch {
      return null;
    }
  }
}
