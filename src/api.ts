import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { ExtendedClient } from "./types";

export function startApiServer(client: ExtendedClient, port: number = 4000) {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*", // Allow all origins for now, or specify dashboard URL
      methods: ["GET", "POST"],
    },
  });

  client.io = io;

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

  // Bot status
  app.get("/api/status", (req, res) => {
    const uptime = client.uptime || 0;
    const uptimeHours = Math.floor(uptime / 1000 / 60 / 60);
    const uptimeMinutes = Math.floor((uptime / 1000 / 60) % 60);

    res.json({
      online: client.isReady(),
      uptime: `${uptimeHours}h ${uptimeMinutes}m`,
      uptimeMs: uptime,
      ping: client.ws.ping,
      user: client.user
        ? {
            id: client.user.id,
            username: client.user.username,
            avatar: client.user.displayAvatarURL(),
          }
        : null,
    });
  });

  // Bot stats
  app.get("/api/stats", (req, res) => {
    const guilds = client.guilds.cache.size;
    const users = client.guilds.cache.reduce(
      (acc, g) => acc + g.memberCount,
      0
    );
    const channels = client.channels.cache.size;
    const activeQueues = client.queues.size;
    const playingQueues = [...client.queues.values()].filter(
      (q) => q.nowPlaying
    ).length;

    // Memory usage
    const memUsage = process.memoryUsage();

    res.json({
      guilds,
      users,
      channels,
      queues: {
        total: activeQueues,
        playing: playingQueues,
      },
      memory: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        rss: Math.round(memUsage.rss / 1024 / 1024),
      },
    });
  });

  // Queue info for a guild
  app.get("/api/queue/:guildId", (req, res) => {
    const payload = getQueuePayload(client, req.params.guildId);
    res.json(payload);
  });

  // All queues summary
  app.get("/api/queues", (req, res) => {
    const queues = [...client.queues.entries()].map(([guildId, queue]) => {
      const guild = client.guilds.cache.get(guildId);
      return {
        guildId,
        guildName: guild?.name || "Unknown",
        nowPlaying: queue.nowPlaying?.title || null,
        queueLength: queue.songs.length,
        loopMode: queue.loopMode,
      };
    });

    res.json({ queues });
  });

  server.listen(port, () => {
    console.log(`[API] ✅ Server running on port ${port}`);
  });

  return app;
}

export function getQueuePayload(client: ExtendedClient, guildId: string) {
  const queue = client.queues.get(guildId);

  if (!queue) {
    return { exists: false, nowPlaying: null, songs: [] };
  }

  const guild = client.guilds.cache.get(guildId);

  return {
    exists: true,
    guildName: guild?.name || "Unknown",
    nowPlaying: queue.nowPlaying
      ? {
          title: queue.nowPlaying.title,
          url: queue.nowPlaying.url,
          duration: queue.nowPlaying.durationInfo,
          thumbnail: queue.nowPlaying.thumbnail,
          requester: queue.nowPlaying.requester,
        }
      : null,
    songs: queue.songs.slice(0, 10).map((s) => ({
      title: s.title,
      duration: s.durationInfo,
      requester: s.requester,
    })),
    totalSongs: queue.songs.length,
    loopMode: queue.loopMode,
    persistent: queue.persistent,
  };
}

export function broadcastGuildUpdate(client: ExtendedClient, guildId: string) {
  if (client.io) {
    const payload = getQueuePayload(client, guildId);
    client.io.emit("guildUpdate", { guildId, ...payload });
  }
}
