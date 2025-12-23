import { Shoukaku, Connectors, Player, Track } from "shoukaku";
import { Client } from "discord.js";
import { ExtendedClient, Queue, Song, LavalinkNode } from "../types";

// Validate environment variables
function validateEnv(): { url: string; auth: string } {
  const url = process.env.LAVALINK_URL;
  const auth = process.env.LAVALINK_PASSWORD;

  if (!url) {
    console.error("[LAVALINK] ❌ LAVALINK_URL not set in .env!");
    console.error("[LAVALINK] Please add: LAVALINK_URL=your-lavalink-ip:2333");
    throw new Error("LAVALINK_URL environment variable is required");
  }

  if (!auth) {
    console.error("[LAVALINK] ❌ LAVALINK_PASSWORD not set in .env!");
    console.error("[LAVALINK] Please add: LAVALINK_PASSWORD=your-password");
    throw new Error("LAVALINK_PASSWORD environment variable is required");
  }

  // Validate URL format
  if (!url.includes(":")) {
    console.error(
      "[LAVALINK] ❌ LAVALINK_URL must include port (e.g., 192.168.1.1:2333)"
    );
    throw new Error("LAVALINK_URL must include port");
  }

  console.log(`[LAVALINK] ✅ Config validated: ${url.split(":")[0]}:****`);
  return { url, auth };
}

// Get validated nodes
function getNodes(): LavalinkNode[] {
  const { url, auth } = validateEnv();
  return [
    {
      name: "Main",
      url,
      auth,
      secure: false,
    },
  ];
}

// Create Shoukaku instance
export function createShoukaku(client: Client): Shoukaku {
  const nodes = getNodes();

  const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes);

  // Event handlers
  shoukaku.on("error", (name, error) => {
    console.error(`[LAVALINK] ❌ Node "${name}" error:`, error);
  });

  shoukaku.on("ready", (name) => {
    console.log(`[LAVALINK] ✅ Node "${name}" connected and ready!`);
  });

  shoukaku.on("close", (name, code, reason) => {
    console.log(
      `[LAVALINK] ⚠️ Node "${name}" closed: code=${code}, reason=${
        reason || "unknown"
      }`
    );
  });

  shoukaku.on("disconnect", (name, count) => {
    console.log(
      `[LAVALINK] 🌷 Node "${name}" disconnected. Players affected: ${count}`
    );
  });

  shoukaku.on("reconnecting", (name, reconnectsLeft, reconnectInterval) => {
    console.log(
      `[LAVALINK] 🔄 Node "${name}" reconnecting... (${reconnectsLeft} attempts left, interval: ${reconnectInterval}ms)`
    );
  });

  return shoukaku;
}

// Check if Lavalink is connected
export function isLavalinkReady(client: ExtendedClient): boolean {
  // Use simple check for any connected node
  return [...client.shoukaku.nodes.values()].some(
    (node) => node.state === 2 // Connected
  );
}

// Get available node or null
export function getAvailableNode(client: ExtendedClient) {
  // Simple round-robin or first available connected node
  const nodes = [...client.shoukaku.nodes.values()];
  return nodes.find((node) => node.state === 2) || null;
}

// Initialize queue for a guild
export function createQueue(): Queue {
  return {
    songs: [],
    player: null,
    textChannelId: null,
    voiceChannelId: null,
    loopMode: 0,
    nowPlaying: null,
    nowPlayingMessage: null,
    persistent: false, // Default: auto-leave enabled
  };
}

// Convert Lavalink track to Song with validation
export function trackToSong(track: Track, requester: string): Song | null {
  if (!track || !track.info) {
    console.error("[LAVALINK] ❌ Invalid track data");
    return null;
  }

  if (!track.encoded) {
    console.error("[LAVALINK] ❌ Track has no encoded data");
    return null;
  }

  return {
    title: track.info.title || "Unknown",
    url: track.info.uri || "",
    duration: (track.info.length || 0) / 1000,
    durationInfo: formatDuration((track.info.length || 0) / 1000),
    thumbnail: track.info.artworkUrl || null,
    requester,
    uploader: track.info.author || "Unknown",
    identifier: track.info.identifier || "",
  };
}

// Format duration helper
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Get or create player for a guild with validation
export async function getPlayer(
  client: ExtendedClient,
  guildId: string,
  voiceChannelId: string
): Promise<Player | null> {
  // Validate inputs
  if (!guildId) {
    console.error("[LAVALINK] ❌ guildId is required");
    return null;
  }

  if (!voiceChannelId) {
    console.error("[LAVALINK] ❌ voiceChannelId is required");
    return null;
  }

  // Check Lavalink connection
  if (!isLavalinkReady(client)) {
    console.error("[LAVALINK] ❌ Lavalink is not connected");
    return null;
  }

  try {
    const player = await client.shoukaku.joinVoiceChannel({
      guildId,
      channelId: voiceChannelId,
      shardId: 0,
      deaf: true,
    });

    if (!player) {
      console.error("[LAVALINK] ❌ Failed to create player");
      return null;
    }

    console.log(`[LAVALINK] ✅ Player created for guild ${guildId}`);
    return player;
  } catch (error) {
    console.error(
      "[LAVALINK] ❌ Failed to join channel:",
      (error as Error).message
    );
    return null;
  }
}

// Destroy player and cleanup with validation
export function destroyPlayer(client: ExtendedClient, guildId: string): void {
  if (!guildId) {
    console.error("[LAVALINK] ❌ guildId is required for destroyPlayer");
    return;
  }

  const queue = client.queues.get(guildId);
  if (queue?.player) {
    try {
      client.shoukaku.leaveVoiceChannel(guildId);
      console.log(`[LAVALINK] ✅ Player destroyed for guild ${guildId}`);
    } catch (error) {
      console.error(
        "[LAVALINK] ❌ Error destroying player:",
        (error as Error).message
      );
    }
  }
  client.queues.delete(guildId);
}
