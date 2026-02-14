import { Telegraf } from "telegraf";
import fs from "node:fs";
import { openMissionControlDB, applySchema } from "@jarvis/mission-control-db";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN");
  process.exit(1);
}

const dbPath = process.env.MISSION_CONTROL_DB_PATH ?? "./data/mission-control.sqlite";

// Bootstrap DB schema (idempotent)
const schemaUrl = new URL(
  "../../../packages/mission-control-db/schema.sql",
  import.meta.url
);
const schemaSql = fs.readFileSync(schemaUrl, "utf8");
const db = openMissionControlDB({ dbPath });
applySchema(db, schemaSql);

const bot = new Telegraf(token);

bot.start(async (ctx) => {
  await ctx.reply(
    "Jarvis online. (Scaffold repo)\n\nTODO: implement /newtask, /status, routing, and Mission Control integration."
  );
});

bot.command("status", async (ctx) => {
  await ctx.reply(
    "Status: scaffold only.\nDB path: " + dbPath + "\n\nTODO: show queued/running tasks + worker heartbeats."
  );
});

bot.launch().then(() => {
  console.log("jarvis-orchestrator started");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
