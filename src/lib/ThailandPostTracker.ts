const AUTH_API_URL =
  "https://trackapi.thailandpost.co.th/post/api/v1/authenticate/token";
const TRACK_API_URL =
  "https://trackapi.thailandpost.co.th/post/api/v1/track";
const TRACKING_NUMBER_PATTERN = /^[A-Z]{2}\d{9}[A-Z]{2}$/;
const REQUEST_TIMEOUT_MS = 10_000;
const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;

export type ThailandPostTrackingErrorCode =
  | "INVALID_TRACKING_NUMBER"
  | "MISSING_TOKEN"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "UPSTREAM_FAILURE"
  | "INVALID_RESPONSE";

export class ThailandPostTrackingError extends Error {
  constructor(public readonly code: ThailandPostTrackingErrorCode) {
    super(code);
    this.name = "ThailandPostTrackingError";
  }
}

export interface ThailandPostTrackingEvent {
  status: string | null;
  statusDescription: string | null;
  statusDate: string | null;
  detail: string | null;
  location: string | null;
  postcode: string | null;
}

export interface ThailandPostTrackingResult {
  barcode: string;
  events: ThailandPostTrackingEvent[];
  quota: {
    used: number;
    limit: number;
  } | null;
}

interface CachedAccessToken {
  developerToken: string;
  accessToken: string;
  expiresAt: number;
}

let cachedAccessToken: CachedAccessToken | null = null;
let pendingAccessToken: {
  developerToken: string;
  promise: Promise<CachedAccessToken>;
} | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function normalizeThailandPostTrackingNumber(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!TRACKING_NUMBER_PATTERN.test(normalized)) {
    throw new ThailandPostTrackingError("INVALID_TRACKING_NUMBER");
  }
  return normalized;
}

async function requestJson(
  url: string,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const name = isRecord(error) ? asText(error.name) : null;
    throw new ThailandPostTrackingError(
      name === "AbortError" || name === "TimeoutError"
        ? "TIMEOUT"
        : "UPSTREAM_FAILURE",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new ThailandPostTrackingError("UNAUTHORIZED");
  }
  if (response.status === 429) {
    throw new ThailandPostTrackingError("RATE_LIMITED");
  }
  if (!response.ok) {
    throw new ThailandPostTrackingError("UPSTREAM_FAILURE");
  }

  try {
    return await response.json();
  } catch {
    throw new ThailandPostTrackingError("INVALID_RESPONSE");
  }
}

async function requestAccessToken(
  developerToken: string,
  fetcher: typeof fetch,
): Promise<CachedAccessToken> {
  const payload = await requestJson(
    AUTH_API_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${developerToken}`,
        "Content-Type": "application/json",
      },
    },
    fetcher,
  );

  if (!isRecord(payload)) {
    throw new ThailandPostTrackingError("INVALID_RESPONSE");
  }

  const accessToken = asText(payload.token);
  const expires = asText(payload.expire);
  const expiresAt = expires
    ? Date.parse(expires.replace(" ", "T"))
    : Number.NaN;
  if (!accessToken || !Number.isFinite(expiresAt)) {
    throw new ThailandPostTrackingError("INVALID_RESPONSE");
  }

  return { developerToken, accessToken, expiresAt };
}

async function getAccessToken(
  developerToken: string,
  fetcher: typeof fetch,
): Promise<string> {
  if (
    cachedAccessToken?.developerToken === developerToken &&
    cachedAccessToken.expiresAt - ACCESS_TOKEN_REFRESH_SKEW_MS > Date.now()
  ) {
    return cachedAccessToken.accessToken;
  }

  if (pendingAccessToken?.developerToken === developerToken) {
    return (await pendingAccessToken.promise).accessToken;
  }

  const promise = requestAccessToken(developerToken, fetcher);
  pendingAccessToken = { developerToken, promise };

  try {
    cachedAccessToken = await promise;
    return cachedAccessToken.accessToken;
  } finally {
    if (pendingAccessToken?.promise === promise) {
      pendingAccessToken = null;
    }
  }
}

function parseTrackingResponse(
  payload: unknown,
  barcode: string,
): ThailandPostTrackingResult {
  if (!isRecord(payload)) {
    throw new ThailandPostTrackingError("INVALID_RESPONSE");
  }

  if (payload.status !== true) {
    const message = asText(payload.message);
    throw new ThailandPostTrackingError(
      message && /quota|blocked/i.test(message)
        ? "RATE_LIMITED"
        : "UPSTREAM_FAILURE",
    );
  }

  if (!isRecord(payload.response) || !isRecord(payload.response.items)) {
    throw new ThailandPostTrackingError("INVALID_RESPONSE");
  }

  const rawEvents = payload.response.items[barcode];
  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    throw new ThailandPostTrackingError("NOT_FOUND");
  }

  const events = rawEvents.filter(isRecord).map((event) => ({
    status: asText(event.status),
    statusDescription: asText(event.status_description),
    statusDate: asText(event.status_date),
    detail: asText(event.status_detail) ?? asText(event.statusDetail),
    location: asText(event.location),
    postcode: asText(event.postcode),
  }));

  if (events.length === 0) {
    throw new ThailandPostTrackingError("INVALID_RESPONSE");
  }

  const trackCount = isRecord(payload.response.track_count)
    ? payload.response.track_count
    : null;
  const used = trackCount ? asNumber(trackCount.count_number) : null;
  const limit = trackCount ? asNumber(trackCount.track_count_limit) : null;

  return {
    barcode,
    events,
    quota: used !== null && limit !== null ? { used, limit } : null,
  };
}

export async function fetchThailandPostTracking(
  trackingNumber: string,
  developerToken = process.env.THAILAND_POST_TOKEN,
  fetcher: typeof fetch = fetch,
): Promise<ThailandPostTrackingResult> {
  const barcode = normalizeThailandPostTrackingNumber(trackingNumber);
  if (!developerToken?.trim()) {
    throw new ThailandPostTrackingError("MISSING_TOKEN");
  }

  const accessToken = await getAccessToken(developerToken.trim(), fetcher);
  const payload = await requestJson(
    TRACK_API_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: "all",
        language: "TH",
        barcode: [barcode],
      }),
    },
    fetcher,
  );

  return parseTrackingResponse(payload, barcode);
}
