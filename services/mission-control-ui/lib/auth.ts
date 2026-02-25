import { NextRequest } from "next/server";

/**
 * Optional Basic Auth gate.
 *
 * v1 placeholder: if BASIC_AUTH_USER & BASIC_AUTH_PASS are set, all API routes
 * should call requireBasicAuth(req) and return the Response.
 */
export function requireBasicAuth(req: NextRequest): Response | null {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return null;

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return new Response("auth required", { status: 401 });
  }

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString(
    "utf8"
  );
  const idx = decoded.indexOf(":");
  const u = idx >= 0 ? decoded.slice(0, idx) : decoded;
  const p = idx >= 0 ? decoded.slice(idx + 1) : "";

  if (u !== user || p !== pass) return new Response("forbidden", { status: 403 });
  return null;
}
