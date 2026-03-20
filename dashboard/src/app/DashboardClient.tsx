"use client";

import { useState, useEffect } from "react";
import io from "socket.io-client";
import { 
  Activity, 
  Users, 
  Server, 
  Music, 
  Wifi, 
  Clock, 
  ShieldCheck,
  Disc3,
  ListMusic
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

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
  const [loading, setLoading] = useState(!initialStatus);

  useEffect(() => {
    const socket = io(apiUrl);

    socket.on("guildUpdate", (data: any) => {
      setQueuesData((prev: any) => {
        const newQueues = [...(prev?.queues || [])];
        const index = newQueues.findIndex((q: any) => q.guildId === data.guildId);

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

    const fetchData = async () => {
      try {
        const [statusRes, statsRes, queuesRes] = await Promise.all([
          fetch(`${apiUrl}/api/status`, { cache: "no-store" }),
          fetch(`${apiUrl}/api/stats`, { cache: "no-store" }),
          fetch(`${apiUrl}/api/queues`, { cache: "no-store" }),
        ]);

        if (statusRes.ok) setStatus(await statusRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
        if (queuesRes.ok) setQueuesData(await queuesRes.json());
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      }
    };

    const pollInterval = setInterval(fetchData, 10000); // Safe 10s refresh
    return () => {
      socket.disconnect();
      clearInterval(pollInterval);
    };
  }, [apiUrl]);

  const StatCard = ({ title, value, icon: Icon, description, trend }: any) => (
    <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value ?? "--"}</div>
        <p className="sr-only">{description}</p>
        <div className="mt-1">
          {trend}
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 md:p-10 space-y-8 max-w-7xl mx-auto">
        <Skeleton className="h-12 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-10">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img 
                src={status?.bot?.avatar || "https://github.com/shadcn.png"} 
                alt="Bot Avatar" 
                className="w-12 h-12 rounded-full border-2 border-border shadow-sm"
              />
              <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-background ${status?.online ? 'bg-emerald-500' : 'bg-red-500'}`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                {status?.bot?.username || "MeoXP"} Dashboard
                <Badge variant={status?.online ? "success" : "destructive"} className="text-[10px] h-5 uppercase">
                  {status?.online ? "Live" : "Offline"}
                </Badge>
              </h1>
              <p className="text-muted-foreground text-sm font-medium">
                Public Operational Metrics & Status
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {session ? (
              <div className="flex items-center gap-3 bg-secondary/50 px-3 py-1.5 rounded-full border border-border/50">
                <img src={session.user?.image} className="w-6 h-6 rounded-full" alt="User" />
                <span className="text-xs font-semibold">{session.user?.name}</span>
                <a href="/api/auth/signout" className="text-[10px] text-muted-foreground hover:text-red-500 transition-colors uppercase font-bold border-l pl-2 ml-1">Out</a>
              </div>
            ) : (
              <a href="/api/auth/signin" className="text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors border px-4 py-2 rounded-md">
                Admin Login
              </a>
            )}
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
            title="Lavalink" 
            value={status?.lavalink ? "Ready" : "Offline"} 
            icon={Wifi}
            trend={
              <Badge variant={status?.lavalink ? "success" : "destructive"} className="px-1.5 py-0 text-[10px]">
                {status?.lavalink ? "Operational" : "Disconnected"}
              </Badge>
            }
          />
          <StatCard 
            title="Uptime" 
            value={status?.uptime} 
            icon={Clock}
            trend={<span className="text-[10px] text-muted-foreground font-medium">SINCE LAST RESTART</span>}
          />
          <StatCard 
            title="Servers" 
            value={stats?.guilds?.toLocaleString()} 
            icon={Server}
            trend={<span className="text-[10px] text-muted-foreground font-medium">TOTAL GUILDS CONNECTED</span>}
          />
          <StatCard 
            title="Users" 
            value={stats?.users?.toLocaleString()} 
            icon={Users}
            trend={<span className="text-[10px] text-muted-foreground font-medium">TOTAL MEMBER REACH</span>}
          />
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-border/40 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-muted-foreground" />
                Bot Connectivity
              </CardTitle>
              <CardDescription>Real-time gateway latency</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end justify-between">
                <div className="text-4xl font-bold tracking-tighter">{status?.ping || 0}<span className="text-xl font-normal text-muted-foreground ml-1">ms</span></div>
                <Badge variant={status?.ping < 100 ? "success" : status?.ping < 300 ? "secondary" : "destructive"} className="mb-1">
                  {status?.ping < 100 ? "Excellent" : status?.ping < 300 ? "Good" : "High"}
                </Badge>
              </div>
              <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ${status?.ping < 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                  style={{ width: `${Math.min(100, (status?.ping || 0) / 5)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Music className="h-5 w-5 text-muted-foreground" />
                Active Playback
              </CardTitle>
              <CardDescription>Ongoing audio streams</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-8 py-2">
              <div className="space-y-1">
                <div className="text-3xl font-bold tracking-tighter">{stats?.queues?.playing || 0}</div>
                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Active Players</div>
              </div>
              <div className="h-10 w-px bg-border/50" />
              <div className="space-y-1">
                <div className="text-3xl font-bold tracking-tighter">{stats?.queues?.total || 0}</div>
                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Cached Queues</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Active Queues Table-like list */}
        <Card className="border-border/40 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListMusic className="h-5 w-5 text-muted-foreground" />
              Active Queues Summary
            </CardTitle>
            <CardDescription>A public overview of what's currently being played across servers.</CardDescription>
          </CardHeader>
          <CardContent>
            {queuesData?.queues?.length > 0 ? (
              <div className="divide-y divide-border/40">
                {queuesData.queues.map((q: any) => (
                  <div key={q.guildId} className="py-4 first:pt-0 last:pb-0 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                        <Disc3 className={`h-5 w-5 text-muted-foreground ${q.nowPlaying ? 'animate-[spin_3s_linear_infinite]' : ''}`} />
                      </div>
                      <div>
                        <div className="font-semibold text-sm group-hover:text-primary transition-colors">{q.guildName}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px] md:max-w-md">
                          {q.nowPlaying || "Standing by..."}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0 h-5">
                        {q.queueLength} TRACKS
                      </Badge>
                      {q.loopMode > 0 && <span className="text-[9px] text-emerald-500 font-bold uppercase tracking-tighter">Loop Active</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center space-y-3">
                <Music className="h-12 w-12 text-muted-foreground/20 mx-auto" />
                <p className="text-muted-foreground text-sm font-medium">No active playback at the moment.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer */}
        <footer className="pt-10 pb-6 border-t border-border/40 flex flex-col md:flex-row justify-between items-center gap-4 text-muted-foreground">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest">
            <ShieldCheck className="h-3.5 w-3.5" />
            Safe Public Status Page
          </div>
          <div className="text-[10px] font-medium tracking-tighter">
            &copy; {new Date().getFullYear()} MEOXP BOT • MINIMALIST DASHBOARD v2.0
          </div>
        </footer>

      </div>
    </div>
  );
}
