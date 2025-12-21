import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

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
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center p-8 bg-gray-800/50 rounded-2xl backdrop-blur-sm border border-gray-700">
          <h1 className="text-4xl font-bold text-white mb-4">
            🎀 MeoXP Bot Dashboard
          </h1>
          <p className="text-gray-400 mb-8">
            กรุณา Login ด้วย Discord เพื่อดูสถานะบอทค่ะนายท่าน~
          </p>
          <a
            href="/api/auth/signin"
            className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-8 rounded-lg transition-all transform hover:scale-105"
          >
            🔐 Login with Discord
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">
              🎀 MeoXP Bot Dashboard
            </h1>
            <p className="text-gray-400">
              ยินดีต้อนรับค่ะ {session.user?.name}~
            </p>
          </div>
          <div className="flex items-center gap-4">
            <img
              src={session.user?.image || ""}
              alt="avatar"
              className="w-10 h-10 rounded-full"
            />
            <a
              href="/api/auth/signout"
              className="text-gray-400 hover:text-white transition"
            >
              Logout
            </a>
          </div>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Bot Status */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">สถานะ</div>
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  status?.online ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="text-xl font-bold text-white">
                {status?.online ? "Online" : "Offline"}
              </span>
            </div>
            {status?.uptime && (
              <div className="text-gray-500 text-sm mt-2">
                Uptime: {status.uptime}
              </div>
            )}
          </div>

          {/* Servers */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">🏠 Servers</div>
            <div className="text-3xl font-bold text-white">
              {stats?.guilds || 0}
            </div>
          </div>

          {/* Users */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">👥 Users</div>
            <div className="text-3xl font-bold text-white">
              {stats?.users?.toLocaleString() || 0}
            </div>
          </div>

          {/* Playing */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">🎵 Playing</div>
            <div className="text-3xl font-bold text-white">
              {stats?.queues?.playing || 0}
            </div>
          </div>
        </div>

        {/* Memory & Ping */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-4">💾 Memory Usage</div>
            <div className="flex items-center gap-4">
              <div className="text-2xl font-bold text-white">
                {stats?.memory?.heapUsed || 0} MB
              </div>
              <div className="text-gray-500">
                / {stats?.memory?.heapTotal || 0} MB
              </div>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 mt-4">
              <div
                className="bg-purple-500 h-2 rounded-full"
                style={{
                  width: `${
                    stats?.memory
                      ? (stats.memory.heapUsed / stats.memory.heapTotal) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-4">📡 Ping</div>
            <div className="text-2xl font-bold text-white">
              {status?.ping || 0} ms
            </div>
          </div>
        </div>

        {/* Active Queues */}
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <div className="text-gray-400 text-sm mb-4">🎵 Active Queues</div>
          {queuesData?.queues?.length > 0 ? (
            <div className="space-y-3">
              {queuesData.queues.map((q: any) => (
                <div
                  key={q.guildId}
                  className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg"
                >
                  <div>
                    <div className="text-white font-medium">{q.guildName}</div>
                    <div className="text-gray-400 text-sm">
                      {q.nowPlaying || "No track playing"}
                    </div>
                  </div>
                  <div className="text-gray-500 text-sm">
                    {q.queueLength} songs
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-gray-500">
              ไม่มี Queue ที่กำลังเล่นอยู่ค่ะ~
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm mt-8">
          💕 MeoXP Bot Dashboard • พร้อมรับใช้นายท่านค่ะ~
        </div>
      </div>
    </div>
  );
}
