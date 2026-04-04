import { createSqliteDatabase } from "./sqlite";

export function createAuthDatabase(databasePath: string) {
  return createSqliteDatabase(databasePath, { strict: false });
}
