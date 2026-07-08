import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { ExtendedClient } from "./types";
import { isLavalinkReady, trackToSong } from "./lib/MoodenglinkManager";

const API_SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'none'; script-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
} as const;

export function startApiServer(
  client: ExtendedClient,
  port: number = 4000,
): void {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*", // Allow all origins for now, or specify dashboard URL
      methods: ["GET", "POST"],
    },
  });

  client.io = io;

  app.disable("x-powered-by");
  app.use((req, res, next) => {
    for (const [header, value] of Object.entries(API_SECURITY_HEADERS)) {
      res.setHeader(header, value);
    }

    next();
  });
  app.use(cors());
  app.use(express.json());

  io.on("connection", (socket) => {
    console.log("[SOCKET] Client connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("[SOCKET] Client disconnected:", socket.id);
    });
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  app.get("/api/status", (req, res) => {
    const uptime = client.uptime || 0;
    const uptimeHours = Math.floor(uptime / 1000 / 60 / 60);
    const uptimeMinutes = Math.floor((uptime / 1000 / 60) % 60);

    res.json({
      online: client.isReady(),
      lavalink: isLavalinkReady(client),
      uptime: `${uptimeHours}h ${uptimeMinutes}m`,
      ping: client.ws.ping,
      // Only public info
      bot: {
        username: client.user?.username || "MeoXP",
        avatar: client.user?.displayAvatarURL() || null,
      },
    });
  });

  app.get("/api/stats", (req, res) => {
    const guilds = client.guilds.cache.size;
    const users = client.guilds.cache.reduce(
      (acc, g) => acc + g.memberCount,
      0,
    );
    const activeQueues = client.manager.players.size;
    const playingQueues = [...client.manager.players.values()].filter(
      (p) => p.queue.current,
    ).length;

    res.json({
      guilds,
      users,
      queues: {
        total: activeQueues,
        playing: playingQueues,
      },
      // Removed memory and channels for security
    });
  });

  // Queue info for a guild
  app.get("/api/queue/:guildId", (req, res) => {
    const payload = getQueuePayload(client, req.params.guildId);
    res.json(payload);
  });

  // All queues summary
  app.get("/api/queues", (req, res) => {
    const queues = [...client.manager.players.entries()].map(
      ([guildId, player]) => {
        const guild = client.guilds.cache.get(guildId);
        return {
          guildId,
          guildName: guild?.name || "Unknown",
          nowPlaying: player.queue.current?.title || null,
          queueLength: player.queue.length,
          loopMode: player.repeatMode,
        };
      },
    );

    res.json({ queues });
  });

  server.listen(port, () => {
    console.log(`[API] ✅ Server running on port ${port}`);
  });
}

export function getQueuePayload(client: ExtendedClient, guildId: string) {
  const player = client.manager.get(guildId);

  if (!player) {
    return { exists: false, nowPlaying: null, songs: [] };
  }

  const guild = client.guilds.cache.get(guildId);
  const current = player.queue.current
    ? trackToSong(player.queue.current)
    : null;

  return {
    exists: true,
    guildName: guild?.name || "Unknown",
    nowPlaying: current
      ? {
          title: current.title,
          url: current.url,
          duration: current.durationInfo,
          thumbnail: current.thumbnail,
          requester: current.requester,
        }
      : null,
    songs: player.queue.slice(0, 10).map((item) => {
      const s = trackToSong(item as any);
      return {
        title: s.title,
        duration: s.durationInfo,
        requester: s.requester,
      };
    }),
    totalSongs: player.queue.length,
    loopMode: player.repeatMode,
    persistent: player.get<boolean>("persistent") ?? false,
  };
}

export function broadcastGuildUpdate(client: ExtendedClient, guildId: string) {
  if (client.io) {
    const payload = getQueuePayload(client, guildId);
    client.io.emit("guildUpdate", { guildId, ...payload });
  }
}
