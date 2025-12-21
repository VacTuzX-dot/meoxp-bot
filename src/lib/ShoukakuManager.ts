import { Shoukaku, Connectors, Player, Track, Node } from "shoukaku";
import { Client, GuildMember } from "discord.js";
import { ExtendedClient, Queue, Song, LavalinkNode } from "../types";

// Default Lavalink nodes
const defaultNodes: LavalinkNode[] = [
  {
    name: "Local",
    url: "193.226.78.187:6861",
    auth: process.env.LAVALINK_PASSWORD || "youshallnotpass",
    secure: false,
  },
];

// Create Shoukaku instance
export function createShoukaku(
  client: Client,
  nodes?: LavalinkNode[]
): Shoukaku {
  const lavalinkNodes = (nodes || defaultNodes).map((node) => ({
    name: node.name,
    url: node.url,
    auth: node.auth,
    secure: node.secure ?? false,
  }));

  const shoukaku = new Shoukaku(
    new Connectors.DiscordJS(client),
    lavalinkNodes,
    {
      moveOnDisconnect: false,
      resume: true,
      resumeTimeout: 30,
      reconnectTries: 3,
      reconnectInterval: 5000,
    }
  );

  // Event handlers
  shoukaku.on("ready", (name) => {
    console.log(`[LAVALINK] Node ${name} connected`);
  });

  shoukaku.on("error", (name, error) => {
    console.error(`[LAVALINK] Node ${name} error:`, error);
  });

  shoukaku.on("close", (name, code, reason) => {
    console.log(`[LAVALINK] Node ${name} closed: ${code} - ${reason}`);
  });

  shoukaku.on("disconnect", (name, count) => {
    console.log(
      `[LAVALINK] Node ${name} disconnected, ${count} players affected`
    );
  });

  return shoukaku;
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
  };
}

// Convert Lavalink track to Song
export function trackToSong(track: Track, requester: string): Song {
  return {
    title: track.info.title || "Unknown",
    url: track.info.uri || "",
    duration: track.info.length / 1000, // Convert ms to seconds
    durationInfo: formatDuration(track.info.length / 1000),
    thumbnail: track.info.artworkUrl || null,
    requester,
    uploader: track.info.author || "Unknown",
    identifier: track.info.identifier || "",
  };
}

// Format duration helper
export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "Unknown";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Get or create player for a guild
export async function getPlayer(
  client: ExtendedClient,
  guildId: string,
  voiceChannelId: string
): Promise<Player | null> {
  try {
    const player = await client.shoukaku.joinVoiceChannel({
      guildId,
      channelId: voiceChannelId,
      shardId: 0,
      deaf: true,
    });
    return player;
  } catch (error) {
    console.error("[LAVALINK] Failed to join channel:", error);
    return null;
  }
}

// Destroy player and cleanup
export function destroyPlayer(client: ExtendedClient, guildId: string): void {
  const queue = client.queues.get(guildId);
  if (queue?.player) {
    client.shoukaku.leaveVoiceChannel(guildId);
  }
  client.queues.delete(guildId);
}
