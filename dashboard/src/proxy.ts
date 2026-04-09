import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function getOrigin(value?: string) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function toWebSocketOrigin(origin: string) {
  if (origin.startsWith("https://")) {
    return origin.replace("https://", "wss://");
  }

  if (origin.startsWith("http://")) {
    return origin.replace("http://", "ws://");
  }

  return origin;
}

function buildConnectSources(isDev: boolean) {
  const browserVisibleOrigins = Array.from(
    new Set(
      [
        getOrigin(process.env.NEXT_PUBLIC_BOT_API_URL),
        isDev ? getOrigin(process.env.BOT_API_URL) : null,
        isDev ? "http://localhost:4000" : null,
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  const secureOrigins = browserVisibleOrigins.filter(
    (origin) => isDev || origin.startsWith("https://"),
  );

  const webSocketOrigins = secureOrigins
    .map(toWebSocketOrigin)
    .filter((origin) => isDev || origin.startsWith("wss://"));

  return Array.from(
    new Set([
      "'self'",
      ...secureOrigins,
      ...webSocketOrigins,
    ]),
  );
}

function buildCsp(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  const connectSources = buildConnectSources(isDev);

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' data: blob: https://github.com https://cdn.discordapp.com https://media.discordapp.net",
    "font-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ]
    .join("; ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const contentSecurityPolicy = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
