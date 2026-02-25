import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { openMissionControlDB, applySchema } from "@jarvis/mission-control-db";

let _db: ReturnType<typeof openMissionControlDB> | null = null;

export function getDb() {
  if (_db) return _db;

  const dbPath = process.env.MISSION_CONTROL_DB_PATH ?? "./data/mission-control.sqlite";

  // Apply schema on boot (idempotent).
  const schemaUrl = new URL(
    "../../../packages/mission-control-db/schema.sql",
    import.meta.url
  );
  // In some Next.js runtimes/bundles, `fileURLToPath` can be picky about the input type.
  // Passing a string keeps this robust.
  const schemaPath = fileURLToPath(schemaUrl.toString());
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const db = openMissionControlDB({ dbPath });
  applySchema(db, schemaSql);

  _db = db;
  return db;
}
