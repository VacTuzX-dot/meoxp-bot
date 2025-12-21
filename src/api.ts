import express from "express";
import cors from "cors";
import { ExtendedClient } from "./types";

export function startApiServer(client: ExtendedClient, port: number = 4000) {
  const app = express();

  app.use(cors());
  app.use(express.json());

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
    const queue = client.queues.get(req.params.guildId);

    if (!queue) {
      res.json({ exists: false, nowPlaying: null, songs: [] });
      return;
    }

    res.json({
      exists: true,
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
    });
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

  app.listen(port, () => {
    console.log(`[API] ✅ Server running on port ${port}`);
  });

  return app;
}
