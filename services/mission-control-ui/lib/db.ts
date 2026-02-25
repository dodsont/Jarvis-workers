import fs from "node:fs";
import path from "node:path";
import { openMissionControlDB, applySchema } from "@jarvis/mission-control-db";

let _db: ReturnType<typeof openMissionControlDB> | null = null;

export function getDb() {
  if (_db) return _db;

  const dbPath = process.env.MISSION_CONTROL_DB_PATH ?? "./data/mission-control.sqlite";

  // Apply schema on boot (idempotent).
  // NOTE: In Next.js production builds, `import.meta.url`/asset bundling can turn this into a
  // `/_next/static/...` URL, which breaks `fileURLToPath`. Use an explicit filesystem path.
  const schemaPath = path.resolve(process.cwd(), "packages/mission-control-db/schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");

  const db = openMissionControlDB({ dbPath });
  applySchema(db, schemaSql);

  _db = db;
  return db;
}
