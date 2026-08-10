// Reverse-engineered from https://gateway-api-cloud-sv1.hnawny.in.th/tracking/
// (friend's site, POST form-encoded tracking_no -> JSON). No auth token needed.
const TRACK_API_URL = "https://gateway-api-cloud-sv1.hnawny.in.th/tracking/";
const REQUEST_TIMEOUT_MS = 10_000;

export type FlashTrackingErrorCode =
  | "INVALID_TRACKING_NUMBER"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "UPSTREAM_FAILURE"
  | "INVALID_RESPONSE";

export class FlashTrackingError extends Error {
  constructor(public readonly code: FlashTrackingErrorCode) {
    super(code);
    this.name = "FlashTrackingError";
  }
}

export interface FlashTrackingEvent {
  message: string | null;
  routedAt: string | null;
}

export interface FlashTrackingResult {
  trackingNo: string;
  statusText: string | null;
  srcProvince: string | null;
  dstProvince: string | null;
  signer: string | null;
  events: FlashTrackingEvent[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseTrackingResponse(payload: unknown): FlashTrackingResult {
  if (!isRecord(payload) || payload.code !== 1 || !isRecord(payload.data)) {
    throw new FlashTrackingError("INVALID_RESPONSE");
  }

  const list = payload.data.list;
  if (!Array.isArray(list) || list.length === 0 || !isRecord(list[0])) {
    throw new FlashTrackingError("NOT_FOUND");
  }
  const item = list[0];

  const routes = Array.isArray(item.routes) ? item.routes : [];
  const events = routes.filter(isRecord).map((r) => ({
    message: asText(r.message),
    routedAt: asText(r.routed_at),
  }));

  const signInfo = isRecord(item.sign_info) ? item.sign_info : null;

  return {
    trackingNo: asText(item.pno_display) ?? "",
    statusText: asText(item.state_text),
    srcProvince: asText(item.src_province_name),
    dstProvince: asText(item.dst_province_name),
    signer: signInfo ? asText(signInfo.signer_show) : null,
    events,
  };
}

export async function fetchFlashTracking(
  trackingNo: string,
  fetcher: typeof fetch = fetch,
): Promise<FlashTrackingResult> {
  const trimmed = trackingNo.trim();
  if (!trimmed) {
    throw new FlashTrackingError("INVALID_TRACKING_NUMBER");
  }

  const body = new URLSearchParams({ tracking_no: trimmed });
  let response: Response;
  try {
    response = await fetcher(TRACK_API_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const name = isRecord(error) ? asText(error.name) : null;
    throw new FlashTrackingError(
      name === "AbortError" || name === "TimeoutError"
        ? "TIMEOUT"
        : "UPSTREAM_FAILURE",
    );
  }

  if (response.status === 429) {
    throw new FlashTrackingError("RATE_LIMITED");
  }
  if (!response.ok) {
    throw new FlashTrackingError("UPSTREAM_FAILURE");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new FlashTrackingError("INVALID_RESPONSE");
  }

  return parseTrackingResponse(payload);
}
