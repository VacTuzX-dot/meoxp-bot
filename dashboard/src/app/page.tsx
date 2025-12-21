import { getServerSession } from "next-auth";

async function getBotStatus() {
  try {
    const res = await fetch(`${process.env.BOT_API_URL}/api/status`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getBotStats() {
  try {
    const res = await fetch(`${process.env.BOT_API_URL}/api/stats`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getQueues() {
  try {
    const res = await fetch(`${process.env.BOT_API_URL}/api/queues`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function Dashboard() {
  const session = await getServerSession();

  if (!session) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="text-center p-10 bg-gradient-to-br from-purple-900/40 to-pink-900/40 rounded-3xl backdrop-blur-xl border border-purple-500/20 shadow-2xl shadow-purple-500/10 max-w-md w-full">
          <div className="text-6xl mb-6">🎀</div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent mb-4">
            MeoXP Dashboard
          </h1>
          <p className="text-gray-400 mb-8 text-lg">
            เข้าสู่ระบบด้วย Discord เพื่อดูสถานะบอทค่ะนายท่าน~
          </p>
          <a
            href="/api/auth/signin"
            className="inline-flex items-center gap-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold py-4 px-8 rounded-xl transition-all transform hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25"
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
            Login with Discord
          </a>
        </div>
      </div>
    );
  }

  const [status, stats, queuesData] = await Promise.all([
    getBotStatus(),
    getBotStats(),
    getQueues(),
  ]);

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
