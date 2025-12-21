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

// Create Shoukaku instance with load balancing
export function createShoukaku(
  client: Client,
  nodes?: LavalinkNode[]
): Shoukaku {
  const lavalinkNodes = (nodes || getNodes()).map((node) => ({
    name: node.name,
    url: node.url,
    auth: node.auth,
    secure: node.secure ?? false,
  }));

  const shoukaku = new Shoukaku(
    new Connectors.DiscordJS(client),
    lavalinkNodes,
    {
      // Advanced load balancer with weighted scoring
      nodeResolver: (nodes, connection) => {
        const availableNodes = [...nodes.values()].filter(
          (node) => node.state >= 1
        );

        if (!availableNodes.length) {
          console.warn("[LAVALINK] ⚠️ No available nodes!");
          return undefined;
        }

        // If only one node, return it
        if (availableNodes.length === 1) {
          return availableNodes[0];
        }

        // Calculate penalty score for each node (lower is better)
        const scoredNodes = availableNodes.map((node) => {
          let penalty = 0;
          const stats = node.stats;

          if (stats) {
            // Player count penalty (weight: 1.5)
            penalty += (stats.players || 0) * 1.5;

            // CPU load penalty (weight: 100)
            const cpuLoad = stats.cpu?.systemLoad ?? 0;
            penalty += cpuLoad * 100;

            // Memory usage penalty (weight: 50)
            if (stats.memory) {
              const memUsage = stats.memory.used / stats.memory.reservable;
              penalty += memUsage * 50;
            }

            // Frame stats penalty (nulled frames = bad)
            if (stats.frameStats) {
              penalty += (stats.frameStats.nulled || 0) * 5;
              penalty += (stats.frameStats.deficit || 0) * 2;
            }
          }

          // Connection state penalty
          if (node.state === 1) penalty += 100; // CONNECTING state

          return { node, penalty };
        });

        // Sort by penalty (lowest first)
        scoredNodes.sort((a, b) => a.penalty - b.penalty);

        const bestNode = scoredNodes[0].node;
        console.log(
          `[LAVALINK] 🎯 Selected node: ${
            bestNode.name
          } (penalty: ${scoredNodes[0].penalty.toFixed(2)})`
        );

        return bestNode;
      },

      // Optimized connection settings for heavy loads
      moveOnDisconnect: true,
      resume: true,
      resumeByLibrary: true,
      resumeTimeout: 120, // 2 minutes for heavy loads
      reconnectTries: 10, // More retries
      reconnectInterval: 3000, // Faster reconnect
      restTimeout: 30000, // 30s REST timeout (faster fail)
      voiceConnectionTimeout: 10000, // 10s voice timeout
    }
  );

  // Event handlers with better logging
  shoukaku.on("ready", (name, reconnected) => {
    console.log(
      `[LAVALINK] ✅ Node ${name} ${reconnected ? "reconnected" : "connected"}`
    );
  });

  shoukaku.on("error", (name, error) => {
    console.error(`[LAVALINK] ❌ Node ${name} error:`, error.message || error);
  });

  shoukaku.on("close", (name, code, reason) => {
    console.warn(
      `[LAVALINK] ⚠️ Node ${name} closed: ${code} - ${reason || "Unknown"}`
    );
  });

  shoukaku.on("disconnect", (name, count) => {
    console.warn(
      `[LAVALINK] ⚠️ Node ${name} disconnected, ${count} players affected`
    );
  });

  return shoukaku;
}

// Check if Lavalink is connected
export function isLavalinkReady(client: ExtendedClient): boolean {
  const nodes = [...client.shoukaku.nodes.values()];

  if (nodes.length === 0) {
    console.warn("[LAVALINK] ⚠️ No nodes configured");
    return false;
  }

  // State: 0=DISCONNECTED, 1=CONNECTING, 2=CONNECTED
  // Accept >= 1 since 'ready' event fires before state updates to 2
  const connectedNodes = nodes.filter((n) => n.state >= 1);

  // Debug log
  console.log(
    `[LAVALINK] Nodes: ${nodes.length}, Connected: ${
      connectedNodes.length
    }, States: ${nodes.map((n) => n.state).join(",")}`
  );

  return connectedNodes.length > 0;
}

// Get available node or null
export function getAvailableNode(client: ExtendedClient) {
  const nodes = [...client.shoukaku.nodes.values()];
  const connectedNodes = nodes.filter((n) => n.state >= 1);

  if (connectedNodes.length === 0) {
    console.warn("[LAVALINK] ⚠️ No connected nodes available");
    return null;
  }
  return client.shoukaku.options.nodeResolver(client.shoukaku.nodes);
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
