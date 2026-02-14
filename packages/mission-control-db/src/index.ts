import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type MissionControlDBOptions = {
  dbPath: string;
};

export function openMissionControlDB(opts: MissionControlDBOptions) {
  fs.mkdirSync(path.dirname(opts.dbPath), { recursive: true });
  const db = new Database(opts.dbPath);
  db.pragma("journal_mode = WAL");
  return db;
}

export function applySchema(db: Database.Database, schemaSql: string) {
  db.exec(schemaSql);
}
