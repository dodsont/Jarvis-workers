import { NextRequest } from "next/server";
import { requireBasicAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const auth = requireBasicAuth(req);
  if (auth) return auth;

  return Response.json({
    ok: true,
    dbPath: process.env.MISSION_CONTROL_DB_PATH ?? "./data/mission-control.sqlite",
  });
}
