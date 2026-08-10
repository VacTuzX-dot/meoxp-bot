const GOOGLE_TTS_ENDPOINT = "https://translate.google.com/translate_tts";
const MAX_TTS_TEXT_LENGTH = 200;

export type GoogleTtsLanguage = "en" | "th";

// See ADR-001.
export function getGoogleTtsUrl(
  text: string,
  language: GoogleTtsLanguage,
): string {
  if (text.length === 0 || text.length > MAX_TTS_TEXT_LENGTH) {
    throw new RangeError(
      `TTS text must contain 1-${MAX_TTS_TEXT_LENGTH} characters`,
    );
  }

  const query = new URLSearchParams({
    ie: "UTF-8",
    q: text,
    tl: language,
    total: "1",
    idx: "0",
    textlen: String(text.length),
    client: "tw-ob",
    prev: "input",
    ttsspeed: "1",
  });

  // WHY: preserve the previous URL contract; URLSearchParams encodes spaces as '+'.
  return `${GOOGLE_TTS_ENDPOINT}?${query.toString().replaceAll("+", "%20")}`;
}
