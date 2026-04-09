import type { NextConfig } from "next";

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

const apiOrigins = Array.from(
  new Set(
    [
      getOrigin(process.env.BOT_API_URL),
      getOrigin(process.env.NEXT_PUBLIC_BOT_API_URL),
      process.env.NODE_ENV === "development" ? "http://localhost:4000" : null,
    ].filter((value): value is string => Boolean(value)),
  ),
);

const connectSources = Array.from(
  new Set([
    "'self'",
    ...apiOrigins,
    ...apiOrigins.map(toWebSocketOrigin),
  ]),
);

const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspDirectives.replace(/\s{2,}/g, " ").trim(),
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Cross-Origin-Resource-Policy",
            value: "same-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
