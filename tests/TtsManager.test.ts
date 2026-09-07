import assert from "node:assert/strict";
import test from "node:test";
import {
  sanitizeTtsText,
  detectLanguage,
  normalizeVoice,
  buildTtsServiceUrl,
  MAX_TTS_TEXT_LENGTH,
  TtsManager,
} from "../src/lib/TtsManager";

test("sanitizeTtsText strips URLs, mentions, spoilers, and code blocks", () => {
  const input =
    "สวัสดีครับ https://google.com <@!123456789> <:smile:998877> ||spoiler|| ```const x = 1;``` `inline` จบ";
  const output = sanitizeTtsText(input);

  assert.equal(output, "สวัสดีครับ smile จบ");
});

test("sanitizeTtsText strips @everyone and @here mentions", () => {
  const input = "แจ้งทุกคน @everyone และ @here เจอกันบ่ายสอง";
  const output = sanitizeTtsText(input);

  assert.equal(output, "แจ้งทุกคน และ เจอกันบ่ายสอง");
});

test("sanitizeTtsText enforces maximum length limit", () => {
  const longText = "ก".repeat(250);
  const output = sanitizeTtsText(longText);

  assert.equal(output.length, MAX_TTS_TEXT_LENGTH);
});

test("sanitizeTtsText returns empty string on empty or whitespace-only input", () => {
  assert.equal(sanitizeTtsText(""), "");
  assert.equal(sanitizeTtsText("   \n\t  "), "");
  assert.equal(sanitizeTtsText("https://only-url.com"), "");
});

test("detectLanguage correctly detects Thai, Japanese, Chinese, and English scripts", () => {
  assert.equal(detectLanguage("สวัสดีครับ"), "th");
  assert.equal(detectLanguage("Hello สวัสดี"), "th");
  assert.equal(detectLanguage("こんにちは"), "ja");
  assert.equal(detectLanguage("ラーメンを食べます"), "ja");
  assert.equal(detectLanguage("テスト"), "ja");
  assert.equal(detectLanguage("你好世界"), "zh-CN");
  assert.equal(detectLanguage("谢谢大家"), "zh-CN");
  assert.equal(detectLanguage("Hello world"), "en");
  assert.equal(detectLanguage("12345!"), "en");
});

test("normalizeVoice maps language aliases accurately", () => {
  assert.equal(normalizeVoice("th"), "th");
  assert.equal(normalizeVoice("THAI"), "th");
  assert.equal(normalizeVoice("ja"), "ja");
  assert.equal(normalizeVoice("jp"), "ja");
  assert.equal(normalizeVoice("Japanese"), "ja");
  assert.equal(normalizeVoice("zh"), "zh-CN");
  assert.equal(normalizeVoice("cn"), "zh-CN");
  assert.equal(normalizeVoice("Chinese"), "zh-CN");
  assert.equal(normalizeVoice("zh-cn"), "zh-CN");
  assert.equal(normalizeVoice("mandarin"), "zh-CN");
  assert.equal(normalizeVoice("en"), "en");
  assert.equal(normalizeVoice("eng"), "en");
  assert.equal(normalizeVoice("english"), "en");
  assert.equal(normalizeVoice("fr"), "fr");
});

test("buildTtsServiceUrl generates well-formed URL with valid parameters", () => {
  const urlStr = buildTtsServiceUrl({
    baseUrl: "http://localhost:20310",
    text: "สวัสดีชาวโลก",
    lang: "th",
    mode: "gTTS",
    speed: 1.2,
  });

  const parsed = new URL(urlStr);
  assert.equal(parsed.origin, "http://localhost:20310");
  assert.equal(parsed.pathname, "/tts");
  assert.equal(parsed.searchParams.get("text"), "สวัสดีชาวโลก");
  assert.equal(parsed.searchParams.get("lang"), "th");
  assert.equal(parsed.searchParams.get("mode"), "gTTS");
  assert.equal(parsed.searchParams.get("speaking_rate"), "1.2");
  assert.equal(parsed.searchParams.get("preferred_format"), "mp3");
});

test("TtsManager rate limiter enforces cooldown per user", () => {
  const manager = new TtsManager({ inMemoryOnly: true });
  const guildId = "test-guild-1";
  const userId = "test-user-1";

  const first = manager.checkRateLimit(guildId, userId);
  assert.equal(first, true, "First request within cooldown window should pass");

  const second = manager.checkRateLimit(guildId, userId);
  assert.equal(second, false, "Immediate second request should be blocked by rate limit");
});

test("TtsManager persists user and guild settings in memory", async () => {
  const manager = new TtsManager({ inMemoryOnly: true });
  await manager.init();

  await manager.setBoundChannel("guild-123", "channel-456");
  assert.equal(manager.getGuildConfig("guild-123")?.boundChannelId, "channel-456");

  await manager.setUserVoice("user-789", "th");
  await manager.setUserSpeed("user-789", 1.5);
  assert.equal(manager.getUserConfig("user-789")?.voice, "th");
  assert.equal(manager.getUserConfig("user-789")?.speed, 1.5);

  // Clamping check for speed
  await manager.setUserSpeed("user-789", 5.0);
  assert.equal(manager.getUserConfig("user-789")?.speed, 2.0);

  await manager.setUserSpeed("user-789", 0.1);
  assert.equal(manager.getUserConfig("user-789")?.speed, 0.5);
});
