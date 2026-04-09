import { connection } from "next/server";
import DashboardClient from "./DashboardClient";

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
  await connection();

  const [status, stats, queuesData] = await Promise.all([
    getBotStatus(),
    getBotStats(),
    getQueues(),
  ]);

  return (
    <DashboardClient
      initialStatus={status}
      initialStats={stats}
      initialQueues={queuesData}
      apiUrl={
        process.env.NEXT_PUBLIC_BOT_API_URL ||
        process.env.BOT_API_URL ||
        "http://localhost:4000"
      }
    />
  );
}
