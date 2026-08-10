import assert from "node:assert/strict";
import test from "node:test";
import { getGoogleTtsUrl } from "../src/lib/GoogleTtsUrl";

test("getGoogleTtsUrl with Unicode text preserves the previous URL contract", () => {
  const url = getGoogleTtsUrl("สวัสดี & hello", "th");

  assert.equal(
    url,
    "https://translate.google.com/translate_tts?ie=UTF-8&q=%E0%B8%AA%E0%B8%A7%E0%B8%B1%E0%B8%AA%E0%B8%94%E0%B8%B5%20%26%20hello&tl=th&total=1&idx=0&textlen=14&client=tw-ob&prev=input&ttsspeed=1",
  );
});

test("getGoogleTtsUrl with empty or oversized text rejects the input", () => {
  assert.throws(() => getGoogleTtsUrl("", "en"), RangeError);
  assert.throws(() => getGoogleTtsUrl("a".repeat(201), "en"), RangeError);
});
