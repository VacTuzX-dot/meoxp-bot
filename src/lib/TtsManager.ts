import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import Datastore from "@seald-io/nedb";
import type { ExtendedClient } from "../types";
import { getPlayer } from "./MoodenglinkManager";
import type { Player, Track } from "moodenglink";

export interface GuildTtsSetting {
  type: "guild";
  guildId: string;
  boundChannelId?: string;
  activeVoiceChannelId?: string;
  defaultVoice?: string;
  defaultSpeed?: number;
}

export interface UserTtsSetting {
  type: "user";
  userId: string;
  voice?: string;
  speed?: number;
}

export interface TtsQueueItem {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  userId: string;
  rawText: string;
  sanitizedText: string;
  voice: string;
  speed: number;
}

interface InterruptedTrackState {
  track: Track;
  position: number;
  wasPaused: boolean;
}

export const MAX_TTS_TEXT_LENGTH = 200;
export const DEFAULT_TTS_SPEED = 1.0;
export const MIN_TTS_SPEED = 0.5;
export const MAX_TTS_SPEED = 2.0;
export const TTS_RATE_LIMIT_MS = 2000;
export const MAX_QUEUE_SIZE_PER_GUILD = 10;

/**
 * Sanitize text for Text-to-Speech playback.
 * Strips URLs, mentions, emojis, spoilers, and markdown.
 */
export function sanitizeTtsText(raw: string): string {
  if (!raw) return "";

  let text = raw;

  // Remove code blocks and inline code
  text = text.replace(/```[\s\S]*?```/g, "");
  text = text.replace(/`[^`]*?`/g, "");

  // Remove spoiler tags content or delimiter
  text = text.replace(/\|\|.*?\|\|/g, "");

  // Strip URLs and replace with indication
  text = text.replace(/https?:\/\/\S+/gi, "");
  text = text.replace(/www\.\S+/gi, "");

  // Strip Discord mentions (<@!123456>, <#123456>, <@&123456>)
  text = text.replace(/<@!?\d+>/g, "");
  text = text.replace(/<#\d+>/g, "");
  text = text.replace(/<@&\d+>/g, "");
  text = text.replace(/@everyone/gi, "");
  text = text.replace(/@here/gi, "");

  // Convert custom emojis <a?:name:123456> to name
  text = text.replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, "$1");

  // Remove markdown formatting characters
  text = text.replace(/[*_~#>]/g, "");

  // Collapse consecutive whitespaces
  text = text.replace(/\s+/g, " ").trim();

  // Truncate to maximum length
  if (text.length > MAX_TTS_TEXT_LENGTH) {
    text = text.slice(0, MAX_TTS_TEXT_LENGTH).trim();
  }

  return text;
}

export type SupportedTtsLanguage = "th" | "ja" | "zh-CN" | "en";

/**
 * Automatically detect language script in text.
 * Priority:
 * 1. Thai: [\u0E00-\u0E7F]
 * 2. Japanese Kana (Hiragana & Katakana): [\u3040-\u309F\u30A0-\u30FF]
 * 3. Chinese Hanzi (CJK Unified Ideographs): [\u4E00-\u9FFF]
 * 4. Fallback: en
 */
export function detectLanguage(text: string): SupportedTtsLanguage {
  if (/[\u0E00-\u0E7F]/.test(text)) {
    return "th";
  }
  // Japanese Hiragana or Katakana
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
    return "ja";
  }
  // Chinese Hanzi (without Japanese Kana)
  if (/[\u4E00-\u9FFF]/.test(text)) {
    return "zh-CN";
  }
  return "en";
}

/**
 * Normalize voice / language aliases to supported gTTS / tts-service language codes.
 */
export function normalizeVoice(voice: string): string {
  const lower = voice.trim().toLowerCase();
  switch (lower) {
    case "th":
    case "thai":
      return "th";
    case "ja":
    case "jp":
    case "japan":
    case "japanese":
      return "ja";
    case "zh":
    case "cn":
    case "chinese":
    case "zh-cn":
    case "zh_cn":
    case "mandarin":
      return "zh-CN";
    case "en":
    case "eng":
    case "english":
    case "us":
    case "uk":
      return "en";
    default:
      return voice;
  }
}

/**
 * Build URL for Discord-TTS (GnomedDev/tts-service).
 */
export function buildTtsServiceUrl(params: {
  baseUrl?: string;
  text: string;
  lang?: string;
  mode?: string;
  speed?: number;
}): string {
  const baseUrl =
    params.baseUrl ||
    process.env.TTS_SERVICE_URL ||
    "http://tts-service:20310";

  const lang = normalizeVoice(params.lang || "th");
  const url = new URL("/tts", baseUrl);
  url.searchParams.set("text", params.text);
  url.searchParams.set("lang", lang);
  url.searchParams.set("mode", params.mode || process.env.TTS_DEFAULT_MODE || "gTTS");
  url.searchParams.set("speaking_rate", String(params.speed ?? DEFAULT_TTS_SPEED));
  url.searchParams.set("preferred_format", "mp3");

  return url.toString();
}

export class TtsManager {
  private db: Datastore;
  private guildConfigs = new Map<string, GuildTtsSetting>();
  private userConfigs = new Map<string, UserTtsSetting>();

  // Queue and concurrency state per guild
  private queues = new Map<string, TtsQueueItem[]>();
  private isProcessing = new Map<string, boolean>();
  private interruptedTracks = new Map<string, InterruptedTrackState>();
  private userLastSpokenTimes = new Map<string, number>();

  constructor(options?: { filename?: string; inMemoryOnly?: boolean }) {
    if (options?.inMemoryOnly) {
      this.db = new Datastore({ inMemoryOnly: true });
    } else {
      const dataDir = join(__dirname, "../../data");
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }

      this.db = new Datastore({
        filename: options?.filename || join(dataDir, "ttsSettings.db"),
        autoload: true,
      });
    }
  }

  public async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.find({}, (err: Error | null, docs: (GuildTtsSetting | UserTtsSetting)[]) => {
        if (err) {
          console.error("[TTS] ❌ Failed to load TTS settings from NoSQL:", err);
          return reject(err);
        }

        for (const doc of docs) {
          if (doc.type === "guild") {
            this.guildConfigs.set(doc.guildId, doc as GuildTtsSetting);
          } else if (doc.type === "user") {
            this.userConfigs.set(doc.userId, doc as UserTtsSetting);
          }
        }

        console.log(
          `[TTS] ✅ Loaded ${this.guildConfigs.size} guild settings, ${this.userConfigs.size} user settings.`
        );
        resolve();
      });
    });
  }

  // --- Guild Settings ---

  public getGuildConfig(guildId: string): GuildTtsSetting | undefined {
    return this.guildConfigs.get(guildId);
  }

  public async setBoundChannel(
    guildId: string,
    channelId: string | undefined
  ): Promise<boolean> {
    const current = this.guildConfigs.get(guildId) || {
      type: "guild",
      guildId,
    };
    current.boundChannelId = channelId;

    return new Promise((resolve) => {
      this.db.update(
        { type: "guild", guildId },
        current,
        { upsert: true },
        (err) => {
          if (err) {
            console.error("[TTS] ❌ Failed to update bound channel:", err);
            return resolve(false);
          }
          this.guildConfigs.set(guildId, current);
          resolve(true);
        }
      );
    });
  }

  public setActiveVoiceChannel(
    guildId: string,
    voiceChannelId: string | undefined
  ): void {
    const current = this.guildConfigs.get(guildId) || {
      type: "guild",
      guildId,
    };
    current.activeVoiceChannelId = voiceChannelId;
    this.guildConfigs.set(guildId, current);
  }

  public getActiveVoiceChannel(guildId: string): string | undefined {
    return this.guildConfigs.get(guildId)?.activeVoiceChannelId;
  }

  // --- User Settings ---

  public getUserConfig(userId: string): UserTtsSetting | undefined {
    return this.userConfigs.get(userId);
  }

  public async setUserVoice(userId: string, voice: string): Promise<boolean> {
    const normalized = normalizeVoice(voice);
    const current = this.userConfigs.get(userId) || { type: "user", userId };
    current.voice = normalized;

    return new Promise((resolve) => {
      this.db.update(
        { type: "user", userId },
        current,
        { upsert: true },
        (err) => {
          if (err) {
            console.error("[TTS] ❌ Failed to update user voice:", err);
            return resolve(false);
          }
          this.userConfigs.set(userId, current);
          resolve(true);
        }
      );
    });
  }

  public async setUserSpeed(userId: string, speed: number): Promise<boolean> {
    const clampedSpeed = Math.min(Math.max(speed, MIN_TTS_SPEED), MAX_TTS_SPEED);
    const current = this.userConfigs.get(userId) || { type: "user", userId };
    current.speed = clampedSpeed;

    return new Promise((resolve) => {
      this.db.update(
        { type: "user", userId },
        current,
        { upsert: true },
        (err) => {
          if (err) {
            console.error("[TTS] ❌ Failed to update user speed:", err);
            return resolve(false);
          }
          this.userConfigs.set(userId, current);
          resolve(true);
        }
      );
    });
  }

  // --- Rate Limiter ---

  public checkRateLimit(guildId: string, userId: string): boolean {
    const key = `${guildId}:${userId}`;
    const now = Date.now();
    const lastTime = this.userLastSpokenTimes.get(key) || 0;

    if (now - lastTime < TTS_RATE_LIMIT_MS) {
      return false;
    }

    this.userLastSpokenTimes.set(key, now);
    return true;
  }

  // --- Queue & Playback Coordinator ---

  public async enqueue(
    client: ExtendedClient,
    item: {
      guildId: string;
      voiceChannelId: string;
      textChannelId: string;
      userId: string;
      text: string;
      explicitVoice?: string;
      explicitSpeed?: number;
    }
  ): Promise<{ success: boolean; reason?: string }> {
    const sanitized = sanitizeTtsText(item.text);
    if (!sanitized) {
      return { success: false, reason: "ข้อความว่างเปล่าหรือไม่ถูกต้องค่ะ" };
    }

    if (!this.checkRateLimit(item.guildId, item.userId)) {
      return { success: false, reason: "กรุณารอสักครู่นะคะ อย่าเพิ่งส่งรัวเกินไปค่ะ~" };
    }

    let queue = this.queues.get(item.guildId);
    if (!queue) {
      queue = [];
      this.queues.set(item.guildId, queue);
    }

    if (queue.length >= MAX_QUEUE_SIZE_PER_GUILD) {
      return { success: false, reason: "คิว TTS เต็มแล้วค่ะ กรุณารอสักครู่นะคะ~" };
    }

    const userSetting = this.getUserConfig(item.userId);
    const guildSetting = this.getGuildConfig(item.guildId);

    const rawVoice =
      item.explicitVoice ||
      userSetting?.voice ||
      guildSetting?.defaultVoice ||
      detectLanguage(sanitized);

    const voice = normalizeVoice(rawVoice);

    const speed =
      item.explicitSpeed ??
      userSetting?.speed ??
      guildSetting?.defaultSpeed ??
      DEFAULT_TTS_SPEED;

    queue.push({
      guildId: item.guildId,
      voiceChannelId: item.voiceChannelId,
      textChannelId: item.textChannelId,
      userId: item.userId,
      rawText: item.text,
      sanitizedText: sanitized,
      voice,
      speed,
    });

    // Start processing queue if not currently running
    this.processQueue(client, item.guildId).catch((err) => {
      console.error(`[TTS] Error processing queue for ${item.guildId}:`, err);
    });

    return { success: true };
  }

  public clearGuildSession(guildId: string): void {
    this.queues.delete(guildId);
    this.isProcessing.delete(guildId);
    this.interruptedTracks.delete(guildId);
    this.setActiveVoiceChannel(guildId, undefined);
  }

  private async processQueue(client: ExtendedClient, guildId: string): Promise<void> {
    if (this.isProcessing.get(guildId)) return;
    this.isProcessing.set(guildId, true);

    try {
      const queue = this.queues.get(guildId);
      if (!queue || queue.length === 0) return;

      while (queue.length > 0) {
        const item = queue.shift();
        if (item) {
          await this.playTtsItem(client, item);
          // WHY: Add a small delay between consecutive TTS items so Discord voice client
          // can finish rendering trailing audio packets and prevent speech overlap/stutter.
          if (queue.length > 0) {
            await new Promise((r) => setTimeout(r, 200));
          }
        }
      }
    } finally {
      this.isProcessing.set(guildId, false);
      // Check if more items arrived while finishing
      const queue = this.queues.get(guildId);
      if (queue && queue.length > 0) {
        this.processQueue(client, guildId).catch(() => {});
      } else {
        // WHY: Allow Discord jitter buffer to drain trailing TTS packets before resuming music
        await new Promise((r) => setTimeout(r, 200));
        await this.resumeInterruptedMusic(client, guildId);
      }
    }
  }

  private async playTtsItem(
    client: ExtendedClient,
    item: TtsQueueItem
  ): Promise<void> {
    const player = await getPlayer(
      client,
      item.guildId,
      item.voiceChannelId,
      item.textChannelId
    );

    if (!player) {
      console.warn(`[TTS] Could not obtain player for guild ${item.guildId}`);
      return;
    }

    // WHY: Save currently playing music if not already recorded
    if (
      !this.interruptedTracks.has(item.guildId) &&
      player.playing &&
      player.current &&
      !player.current.userData?.isTts
    ) {
      this.interruptedTracks.set(item.guildId, {
        track: player.current,
        position: player.position,
        wasPaused: player.paused,
      });
      console.log(
        `[TTS] Saved interrupted track "${player.current.title}" at ${player.position}ms`
      );
    }

    const ttsUrl = buildTtsServiceUrl({
      text: item.sanitizedText,
      lang: item.voice,
      speed: item.speed,
    });

    const result = await client.manager.search(ttsUrl, "TTS");

    if (
      result.loadType === "error" ||
      result.loadType === "empty" ||
      !result.tracks ||
      result.tracks.length === 0
    ) {
      console.error(`[TTS] Failed to load audio from ${ttsUrl}`);
      return;
    }

    const ttsTrack = result.tracks[0];
    ttsTrack.userData = { isTts: true };

    // Play TTS audio and wait for it to finish
    await new Promise<void>((resolve) => {
      let resolved = false;
      const onDone = () => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve();
        }
      };

      const trackEndHandler = (
        endPlayer: Player,
        track: Track,
        payload: { reason?: string }
      ) => {
        if (endPlayer.guild === item.guildId && track.userData?.isTts) {
          // If replaced by another TTS track or finished, resolve
          if (payload.reason !== "replaced") {
            onDone();
          }
        }
      };

      const playerDestroyHandler = (destroyedPlayer: Player) => {
        if (destroyedPlayer.guild === item.guildId) {
          onDone();
        }
      };

      const cleanup = () => {
        client.manager.off("trackEnd", trackEndHandler);
        client.manager.off("playerDestroy", playerDestroyHandler);
        clearTimeout(safetyTimeout);
      };

      client.manager.on("trackEnd", trackEndHandler);
      client.manager.on("playerDestroy", playerDestroyHandler);

      // Safety fallback timeout: estimated duration based on text length (max 30s)
      const maxDuration = Math.max(10000, item.sanitizedText.length * 400);
      const safetyTimeout = setTimeout(onDone, Math.min(maxDuration, 30000));

      player.play({ track: ttsTrack }).catch((err) => {
        console.error("[TTS] player.play error:", err);
        onDone();
      });
    });
  }

  private async resumeInterruptedMusic(
    client: ExtendedClient,
    guildId: string
  ): Promise<void> {
    const interrupted = this.interruptedTracks.get(guildId);
    if (!interrupted) return;

    this.interruptedTracks.delete(guildId);

    const player = client.manager.get(guildId);
    if (!player?.connected) return;

    console.log(
      `[TTS] Resuming interrupted music: "${interrupted.track.title}" from ${interrupted.position}ms`
    );

    try {
      await player.play({
        track: interrupted.track,
        startTime: interrupted.position,
      });

      if (interrupted.wasPaused) {
        await player.pause(true);
      }
    } catch (error) {
      console.error("[TTS] Failed to resume interrupted music:", error);
    }
  }
}

export const ttsManager = new TtsManager();
