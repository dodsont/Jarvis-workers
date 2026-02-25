import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return new NextResponse("auth required", {
    status: 401,
    headers: {
      // Causes the browser to show the Basic Auth prompt.
      "WWW-Authenticate": 'Basic realm="Mission Control", charset="UTF-8"',
    },
  });
}

export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;

  // If creds are not configured, don't gate anything.
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized();

  let decoded = "";
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return unauthorized();
  }

  const idx = decoded.indexOf(":");
  const u = idx >= 0 ? decoded.slice(0, idx) : decoded;
  const p = idx >= 0 ? decoded.slice(idx + 1) : "";

  if (u !== user || p !== pass) return unauthorized();

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next.js internals and common static assets.
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
