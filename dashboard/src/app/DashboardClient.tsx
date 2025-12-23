"use client";

import { useState, useEffect } from "react";
import io from "socket.io-client";

interface DashboardClientProps {
  session: any;
  initialStatus: any;
  initialStats: any;
  initialQueues: any;
  apiUrl: string;
}

export default function DashboardClient({
  session,
  initialStatus,
  initialStats,
  initialQueues,
  apiUrl,
}: DashboardClientProps) {
  const [status, setStatus] = useState(initialStatus);
  const [stats, setStats] = useState(initialStats);
  const [queuesData, setQueuesData] = useState(initialQueues);

  useEffect(() => {
    const socket = io(apiUrl);

    socket.on("connect", () => {
      console.log("Connected to bot socket");
    });

    socket.on("guildUpdate", (data: any) => {
      setQueuesData((prev: any) => {
        const newQueues = [...(prev?.queues || [])];
        const index = newQueues.findIndex(
          (q: any) => q.guildId === data.guildId
        );

        const queueItem = {
          guildId: data.guildId,
          guildName: data.guildName || "Unknown",
          nowPlaying: data.nowPlaying?.title || null,
          queueLength: data.totalSongs,
          loopMode: data.loopMode,
        };

        if (index !== -1) {
          newQueues[index] = queueItem;
        } else {
          newQueues.push(queueItem);
        }
        return { queues: newQueues };
      });
    });

    // Polling every 100ms for realtime updates
    const fetchData = async () => {
      try {
        const [statusRes, statsRes, queuesRes] = await Promise.all([
          fetch(`${apiUrl}/api/status`),
          fetch(`${apiUrl}/api/stats`),
          fetch(`${apiUrl}/api/queues`),
        ]);

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setStatus(statusData);
        }

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }

        if (queuesRes.ok) {
          const queuesDataNew = await queuesRes.json();
          setQueuesData(queuesDataNew);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      }
    };

    const pollInterval = setInterval(fetchData, 100);

    return () => {
      socket.disconnect();
      clearInterval(pollInterval);
    };
  }, [apiUrl]);

  const memoryPercent = stats?.memory
    ? Math.round((stats.memory.heapUsed / stats.memory.heapTotal) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-purple-900/20 via-transparent to-pink-900/20 pointer-events-none" />

      <div className="relative z-10 p-6 md:p-10 max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-10">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-pink-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent flex items-center gap-3">
              <span className="text-4xl">🎀</span>
              MeoXP Dashboard
            </h1>
            <p className="text-gray-500 mt-2">
              ยินดีต้อนรับค่ะ{" "}
              <span className="text-purple-400">{session.user?.name}</span>~
            </p>
          </div>
          <div className="flex items-center gap-4 bg-white/5 py-2 px-4 rounded-full border border-white/10">
            <img
              src={session.user?.image || ""}
              alt="avatar"
              className="w-10 h-10 rounded-full ring-2 ring-purple-500/50"
            />
            <span className="text-white font-medium hidden sm:block">
              {session.user?.name}
            </span>
            <a
              href="/api/auth/signout"
              className="text-gray-400 hover:text-red-400 transition ml-2"
            >
              ออก
            </a>
          </div>
        </header>

        {/* Status Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
          {/* Online Status */}
          <div className="group bg-gradient-to-br from-green-900/30 to-emerald-900/30 rounded-2xl p-6 border border-green-500/20 hover:border-green-500/40 transition-all hover:shadow-lg hover:shadow-green-500/10">
            <div className="flex items-center gap-2 text-gray-400 text-sm mb-3">
              <div
                className={`w-2 h-2 rounded-full ${
                  status?.online ? "bg-green-500 animate-pulse" : "bg-red-500"
                }`}
              />
              สถานะ
            </div>
            <div className="text-3xl font-bold text-white mb-1">
              {status?.online ? "Online" : "Offline"}
            </div>
            <div className="text-gray-500 text-sm">
              Uptime: {status?.uptime || "0h 0m"}
            </div>
          </div>

          {/* Servers */}
          <div className="group bg-gradient-to-br from-purple-900/30 to-violet-900/30 rounded-2xl p-6 border border-purple-500/20 hover:border-purple-500/40 transition-all hover:shadow-lg hover:shadow-purple-500/10">
            <div className="text-gray-400 text-sm mb-3">🏠 Servers</div>
            <div className="text-4xl font-bold bg-gradient-to-r from-purple-300 to-violet-300 bg-clip-text text-transparent">
              {stats?.guilds || 0}
            </div>
          </div>

          {/* Users */}
          <div className="group bg-gradient-to-br from-blue-900/30 to-cyan-900/30 rounded-2xl p-6 border border-blue-500/20 hover:border-blue-500/40 transition-all hover:shadow-lg hover:shadow-blue-500/10">
            <div className="text-gray-400 text-sm mb-3">👥 Users</div>
            <div className="text-4xl font-bold bg-gradient-to-r from-blue-300 to-cyan-300 bg-clip-text text-transparent">
              {stats?.users?.toLocaleString() || 0}
            </div>
          </div>

          {/* Playing */}
          <div className="group bg-gradient-to-br from-pink-900/30 to-rose-900/30 rounded-2xl p-6 border border-pink-500/20 hover:border-pink-500/40 transition-all hover:shadow-lg hover:shadow-pink-500/10">
            <div className="text-gray-400 text-sm mb-3">🎵 Playing</div>
            <div className="text-4xl font-bold bg-gradient-to-r from-pink-300 to-rose-300 bg-clip-text text-transparent">
              {stats?.queues?.playing || 0}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-8">
          {/* Memory */}
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
            <div className="flex justify-between items-center mb-4">
              <span className="text-gray-400">💾 Memory Usage</span>
              <span className="text-sm text-gray-500">{memoryPercent}%</span>
            </div>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-3xl font-bold text-white">
                {stats?.memory?.heapUsed || 0}
              </span>
              <span className="text-gray-500">
                / {stats?.memory?.heapTotal || 0} MB
              </span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                style={{ width: `${memoryPercent}%` }}
              />
            </div>
          </div>

          {/* Ping */}
          <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
            <div className="text-gray-400 mb-4">📡 API Latency</div>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                {status?.ping || 0}
              </span>
              <span className="text-gray-400 text-xl">ms</span>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  (status?.ping || 0) < 100
                    ? "bg-green-500"
                    : (status?.ping || 0) < 300
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
              />
              <span className="text-gray-500 text-sm">
                {(status?.ping || 0) < 100
                  ? "Excellent"
                  : (status?.ping || 0) < 300
                  ? "Good"
                  : "High Latency"}
              </span>
            </div>
          </div>
        </div>

        {/* Active Queues */}
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <span className="text-2xl">🎵</span> Active Queues
            </h2>
            <span className="text-sm text-gray-500 bg-white/5 px-3 py-1 rounded-full">
              {queuesData?.queues?.length || 0} active
            </span>
          </div>

          {queuesData?.queues?.length > 0 ? (
            <div className="space-y-3">
              {queuesData.queues.map((q: any) => (
                <div
                  key={q.guildId}
                  className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-purple-500/30 transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center text-2xl">
                      🎧
                    </div>
                    <div>
                      <div className="text-white font-medium group-hover:text-purple-300 transition">
                        {q.guildName}
                      </div>
                      <div className="text-gray-500 text-sm truncate max-w-[200px] md:max-w-[400px]">
                        {q.nowPlaying || "ไม่มีเพลงที่กำลังเล่น"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-purple-400 font-medium">
                      {q.queueLength} เพลง
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🎵</div>
              <div className="text-gray-500">
                ไม่มี Queue ที่กำลังเล่นอยู่ค่ะ~
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="text-center py-6">
          <p className="text-gray-600 text-sm">
            Made with 💕 by MeoXP • พร้อมรับใช้นายท่านค่ะ~
          </p>
        </footer>
      </div>
    </div>
  );
}
