import { mkdirSync } from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";

export function createSqliteDatabase(databasePath: string, options: { strict?: boolean } = {}): Database {
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new Database(databasePath, {
    create: true,
    strict: options.strict ?? true,
  });
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  return database;
}
