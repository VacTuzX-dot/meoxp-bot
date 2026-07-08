import {
  Moodenglink,
  Player,
  Track,
  RepeatMode,
} from "moodenglink";
import { ActivityType, Client, PresenceUpdateStatus, Message } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { ExtendedClient, Song } from "../types";

// Validate environment variables
function validateEnv(): { host: string; port: number; password: string } {
  const url = process.env.LAVALINK_URL;
  const password = process.env.LAVALINK_PASSWORD;

  if (!url) {
    console.error("[LAVALINK] ❌ LAVALINK_URL not set in .env!");
    console.error("[LAVALINK] Please add: LAVALINK_URL=your-lavalink-ip:2333");
    throw new Error("LAVALINK_URL environment variable is required");
  }

  if (!password) {
    console.error("[LAVALINK] ❌ LAVALINK_PASSWORD not set in .env!");
    console.error("[LAVALINK] Please add: LAVALINK_PASSWORD=your-password");
    throw new Error("LAVALINK_PASSWORD environment variable is required");
  }

  const [host, portStr] = url.split(":");
  const port = Number(portStr);
  if (!host || !port) {
    console.error(
      "[LAVALINK] ❌ LAVALINK_URL must include port (e.g., 192.168.1.1:2333)"
    );
    throw new Error("LAVALINK_URL must include port");
  }

  console.log(`[LAVALINK] ✅ Config validated: ${host}:****`);
  return { host, port, password };
}

// Format duration helper
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Convert a moodenglink Track to the Song view used by embeds/dashboard
export function trackToSong(track: Track): Song {
  const durationSec = (track.duration || 0) / 1000;
  return {
    title: track.title || "Unknown",
    url: track.uri || "",
    duration: durationSec,
    durationInfo: formatDuration(durationSec),
    thumbnail: track.artworkUrl || null,
    requester: typeof track.requester === "string" ? track.requester : "Unknown",
    uploader: track.author || "Unknown",
    identifier: track.identifier || "",
  };
}

// Create Now Playing embed from live player state
function createNowPlayingEmbed(player: Player, song: Song): EmbedBuilder {
  const loopModes = ["➡️ ปิด", "🔂 เพลงเดียว", "🔁 ทั้ง Queue"];

  const embed = new EmbedBuilder()
    .setTitle("🎵 กำลังเล่นเพลงค่ะ~")
    .setDescription(`**${song.title}**`)
    .setColor(0x00ff88)
    .addFields(
      { name: "⏱️ ความยาว", value: song.durationInfo || "Unknown", inline: true },
      { name: "🎤 ศิลปิน", value: song.uploader || "Unknown", inline: true },
      { name: "👤 ขอโดย", value: song.requester || "Unknown", inline: true },
      {
        name: "🔊 คุณภาพเสียง",
        value: "`OPUS` • 128kbps • 48kHz • Stereo",
        inline: false,
      },
      { name: "🔄 Loop", value: loopModes[player.repeatMode] || loopModes[0], inline: true },
      { name: "📋 Queue", value: `${player.queue.length} เพลง`, inline: true }
    )
    .setFooter({ text: "💕 เพลงเพราะมากเลยค่ะ~" });

  if (song.thumbnail) embed.setThumbnail(song.thumbnail);
  return embed;
}

function updateBotPresence(client: ExtendedClient, inVoice: boolean): void {
  client.user?.setPresence({
    status: inVoice
      ? PresenceUpdateStatus.DoNotDisturb
      : PresenceUpdateStatus.Idle,
    activities: [
      {
        name: inVoice ? "🎵 กำลังเล่นเพลง~" : "เปิดใช้เมนูพิมพ์ !!help ค่ะ 😊",
        type: ActivityType.Listening,
      },
    ],
  });
}

// WHY: api.ts imports this module; require lazily inside handlers to avoid a
// circular import at module-load time.
function broadcast(client: ExtendedClient, guildId: string): void {
  const { broadcastGuildUpdate } = require("../api");
  broadcastGuildUpdate(client, guildId);
}

// Create Moodenglink manager instance
export function createManager(client: Client): Moodenglink {
  const { host, port, password } = validateEnv();
  const ext = client as ExtendedClient;

  const manager = new Moodenglink({
    nodes: [{ host, port, password, identifier: "Main" }],
    defaultSearchPlatform: "youtube",
    send: (guildId, payload) =>
      client.guilds.cache.get(guildId)?.shard.send(payload),
  });

  manager.on("nodeConnect", (node) => {
    console.log(`[LAVALINK] ✅ Node "${node.id}" connected and ready!`);
  });

  manager.on("nodeError", (node, error) => {
    console.error(`[LAVALINK] ❌ Node "${node.id}" error:`, error.message);
  });

  manager.on("nodeDisconnect", (node, reason) => {
    console.log(
      `[LAVALINK] ⚠️ Node "${node.id}" disconnected: code=${reason.code}, reason=${
        reason.reason || "unknown"
      }`
    );
  });

  manager.on("nodeReconnect", (node) => {
    console.log(`[LAVALINK] 🔄 Node "${node.id}" reconnecting...`);
  });

  manager.on("trackStart", async (player, track) => {
    const song = trackToSong(track);
    console.log("[PLAY] Now playing:", song.title);
    updateBotPresence(ext, true);
    broadcast(ext, player.guild);

    if (!player.textChannel) return;
    try {
      const channel = await client.channels.fetch(player.textChannel);
      if (!channel || !("send" in channel)) return;

      const oldMsg = player.get<Message>("nowPlayingMessage");
      oldMsg?.delete().catch(() => {});

      const npMsg = await (channel as any)
        .send({ embeds: [createNowPlayingEmbed(player, song)] })
        .catch(() => null);
      player.set("nowPlayingMessage", npMsg);
    } catch (error) {
      console.error("[PLAY] Now-playing message error:", (error as Error).message);
    }
  });

  manager.on("trackError", (player, track, payload) => {
    console.error("[PLAYER] Track error:", track.title, payload.exception?.message);
  });

  manager.on("trackStuck", (player, track) => {
    console.log("[PLAYER] Track stuck, skipping:", track.title);
  });

  manager.on("queueEnd", (player) => {
    player.get<Message>("nowPlayingMessage")?.delete().catch(() => {});
    player.set("nowPlayingMessage", null);
    broadcast(ext, player.guild);
  });

  manager.on("playerDestroy", (player) => {
    player.get<Message>("nowPlayingMessage")?.delete().catch(() => {});
    updateBotPresence(ext, false);
    broadcast(ext, player.guild);
  });

  return manager;
}

// Check if Lavalink is connected
export function isLavalinkReady(client: ExtendedClient): boolean {
  return [...client.manager.nodes.values()].some((node) => node.connected);
}

// Get or create a connected player for a guild
export async function getPlayer(
  client: ExtendedClient,
  guildId: string,
  voiceChannelId: string,
  textChannelId?: string
): Promise<Player | null> {
  if (!guildId || !voiceChannelId) {
    console.error("[LAVALINK] ❌ guildId and voiceChannelId are required");
    return null;
  }

  if (!isLavalinkReady(client)) {
    console.error("[LAVALINK] ❌ Lavalink is not connected");
    return null;
  }

  try {
    const player = client.manager.create({
      guild: guildId,
      voiceChannel: voiceChannelId,
      textChannel: textChannelId,
      selfDeafen: true,
    });
    if (textChannelId) player.setTextChannel(textChannelId);
    if (!player.connected) player.connect();

    console.log(`[LAVALINK] ✅ Player ready for guild ${guildId}`);
    return player;
  } catch (error) {
    console.error(
      "[LAVALINK] ❌ Failed to join channel:",
      (error as Error).message
    );
    return null;
  }
}

// Destroy player and cleanup
export function destroyPlayer(client: ExtendedClient, guildId: string): void {
  if (!guildId) return;
  const player = client.manager.get(guildId);
  if (!player) return;

  player.destroy().then(
    () => console.log(`[LAVALINK] ✅ Player destroyed for guild ${guildId}`),
    (error: Error) =>
      console.error("[LAVALINK] ❌ Error destroying player:", error.message)
  );
}

export { RepeatMode };
export type { Player, Track };
