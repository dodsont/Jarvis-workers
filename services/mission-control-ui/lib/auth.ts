import { NextRequest } from "next/server";

/**
 * Optional Basic Auth gate.
 *
 * NOTE: Mission Control now also enforces auth globally via Next middleware.
 * This helper remains as a defense-in-depth check for API routes.
 */
export function requireBasicAuth(req: NextRequest): Response | null {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return null;

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return new Response("auth required", {
      status: 401,
      headers: {
        // Causes the browser to show the Basic Auth prompt.
        "WWW-Authenticate": 'Basic realm="Mission Control", charset="UTF-8"',
      },
    });
  }

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString(
    "utf8"
  );
  const idx = decoded.indexOf(":");
  const u = idx >= 0 ? decoded.slice(0, idx) : decoded;
  const p = idx >= 0 ? decoded.slice(idx + 1) : "";

  if (u !== user || p !== pass) {
    // Use 401 (not 403) so browsers re-prompt.
    return new Response("auth required", {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="Mission Control", charset="UTF-8"',
      },
    });
  }
  return null;
}
