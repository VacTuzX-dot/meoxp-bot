import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchThailandPostTracking,
  ThailandPostTrackingError,
  type ThailandPostTrackingErrorCode,
} from "../src/lib/ThailandPostTracker";

const AUTH_URL =
  "https://trackapi.thailandpost.co.th/post/api/v1/authenticate/token";
const TRACK_URL = "https://trackapi.thailandpost.co.th/post/api/v1/track";
const TRACKING_NUMBER = "EY145587896TH";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function authResponse(accessToken: string): Response {
  return jsonResponse({
    expire: "2099-09-10 10:22:13+07:00",
    token: accessToken,
  });
}

async function assertTrackingError(
  promise: Promise<unknown>,
  code: ThailandPostTrackingErrorCode,
) {
  await assert.rejects(
    promise,
    (error) =>
      error instanceof ThailandPostTrackingError && error.code === code,
  );
}

test("fetchThailandPostTracking with a valid number returns normalized events", async () => {
  // Arrange
  const fetcher = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    if (String(input) === AUTH_URL) {
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Token developer-success",
      );
      assert.equal(init?.body, undefined);
      return authResponse("access-success");
    }

    assert.equal(String(input), TRACK_URL);
    assert.equal(init?.method, "POST");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Token access-success",
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      status: "all",
      language: "TH",
      barcode: [TRACKING_NUMBER],
    });

    return jsonResponse({
      status: true,
      message: "successful",
      response: {
        items: {
          [TRACKING_NUMBER]: [
            {
              status: "103",
              status_description: "รับฝาก",
              status_date: "09/08/2569 15:13:00+07:00",
              status_detail: "ปณ.ต้นทางรับฝากแล้ว",
              location: "ต้นทาง",
              postcode: "10000",
            },
            {
              status: "301",
              status_description: "เตรียมนำจ่าย",
              status_date: "10/08/2569 10:01:49+07:00",
              status_detail: "ถึง ปณ.ปลายทาง เตรียมนำจ่าย",
              location: "ปลายทาง",
              postcode: "50000",
            },
          ],
        },
        track_count: { count_number: 1, track_count_limit: 1000 },
      },
    });
  }) as typeof fetch;

  // Act
  const result = await fetchThailandPostTracking(
    ` ${TRACKING_NUMBER.toLowerCase()} `,
    "developer-success",
    fetcher,
  );

  // Assert
  assert.equal(result.barcode, TRACKING_NUMBER);
  assert.equal(result.events.length, 2);
  assert.equal(result.events.at(-1)?.detail, "ถึง ปณ.ปลายทาง เตรียมนำจ่าย");
  assert.deepEqual(result.quota, { used: 1, limit: 1000 });
});

test("fetchThailandPostTracking with invalid input rejects before fetch", async () => {
  // Arrange
  let called = false;
  const fetcher = (async () => {
    called = true;
    return jsonResponse({});
  }) as typeof fetch;

  // Act + Assert
  await assertTrackingError(
    fetchThailandPostTracking("../../etc/passwd", "test-token", fetcher),
    "INVALID_TRACKING_NUMBER",
  );
  assert.equal(called, false);
});

test("fetchThailandPostTracking without a token rejects before fetch", async () => {
  // Arrange
  let called = false;
  const fetcher = (async () => {
    called = true;
    return jsonResponse({});
  }) as typeof fetch;

  // Act + Assert
  await assertTrackingError(
    fetchThailandPostTracking(TRACKING_NUMBER, "", fetcher),
    "MISSING_TOKEN",
  );
  assert.equal(called, false);
});

test("fetchThailandPostTracking with rejected credentials maps unauthorized", async () => {
  const fetcher = (async () => jsonResponse({}, 401)) as typeof fetch;

  await assertTrackingError(
    fetchThailandPostTracking(TRACKING_NUMBER, "developer-auth", fetcher),
    "UNAUTHORIZED",
  );
});

test("fetchThailandPostTracking with quota response maps rate limited", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    return calls === 1
      ? authResponse("access-quota")
      : jsonResponse({
          status: false,
          message: "blocked, your request over quota!!",
        });
  }) as typeof fetch;

  await assertTrackingError(
    fetchThailandPostTracking(TRACKING_NUMBER, "developer-quota", fetcher),
    "RATE_LIMITED",
  );
});

test("fetchThailandPostTracking with malformed JSON maps invalid response", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    return calls === 1
      ? authResponse("access-json")
      : new Response("not-json", { status: 200 });
  }) as typeof fetch;

  await assertTrackingError(
    fetchThailandPostTracking(TRACKING_NUMBER, "developer-json", fetcher),
    "INVALID_RESPONSE",
  );
});

test("fetchThailandPostTracking with a valid cached token authenticates once", async () => {
  let authCalls = 0;
  const fetcher = (async (input: string | URL | Request) => {
    if (String(input) === AUTH_URL) {
      authCalls += 1;
      return authResponse("access-cache");
    }
    return jsonResponse({
      status: true,
      response: {
        items: {
          [TRACKING_NUMBER]: [{ status: "103", status_detail: "รับฝาก" }],
        },
      },
    });
  }) as typeof fetch;

  await fetchThailandPostTracking(TRACKING_NUMBER, "developer-cache", fetcher);
  await fetchThailandPostTracking(TRACKING_NUMBER, "developer-cache", fetcher);

  assert.equal(authCalls, 1);
});
