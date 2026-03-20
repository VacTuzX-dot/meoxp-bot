import { Message, EmbedBuilder } from "discord.js";
import * as si from "systeminformation";
import { ExtendedClient, Command } from "../types";

const command: Command = {
  name: "server",
  aliases: ["status", "sysinfo", "sys"],
  description: "Show detailed server status",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    // Owner check
    if (message.author.id !== process.env.OWNER_ID) {
      message.reply("⛔ ขอโทษนะคะ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ค่ะ 🙏");
      return;
    }

    const msg = await message.reply("🔄 กำลังเก็บข้อมูล Server...");

    try {
      const [cpu, cpuInfo, mem, osInfo, disk, load] = await Promise.all([
        si.cpuCurrentSpeed(),
        si.cpu(),
        si.mem(),
        si.osInfo(),
        si.fsSize(),
        si.currentLoad(),
      ]);

      const uptime = si.time().uptime;
      const processUptime = process.uptime();

      // Format uptime
      function formatUptime(seconds: number): string {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return days > 0 ? `${days}d ${hours}h` : `${hours}h ${mins}m`;
      }

      // Progress bar
      function createProgressBar(
        current: number,
        total: number,
        length: number
      ): string {
        const percent = (current / total) * 100;
        const filled = Math.round((percent / 100) * length);
        const empty = length - filled;
        return "█".repeat(filled) + "░".repeat(empty);
      }

      const ramUsed = (mem.active / 1024 / 1024 / 1024).toFixed(2);
      const ramTotal = (mem.total / 1024 / 1024 / 1024).toFixed(2);
      const cpuPercent = load.currentLoad.toFixed(1);

      const diskUsed = (disk[0]?.used || 0) / 1024 / 1024 / 1024;
      const diskTotal = (disk[0]?.size || 1) / 1024 / 1024 / 1024;

      // Bot stats
      const guilds = client.guilds.cache.size;
      const activeQueues = client.queues?.size || 0;

      const embed = new EmbedBuilder()
        .setTitle(`🖥️ Server Status`)
        .setColor(0x00ff88)
        .setDescription(`**${osInfo.hostname}** • ${osInfo.distro}`)
        .addFields(
          {
            name: "💻 CPU",
            value: `\`\`\`${cpuInfo.manufacturer} ${cpuInfo.brand}\n${
              cpuInfo.cores
            } cores @ ${cpu.avg || cpu.min} GHz\n${createProgressBar(
              load.currentLoad,
              100,
              10
            )} ${cpuPercent}%\`\`\``,
            inline: false,
          },
          {
            name: "🧠 RAM",
            value: `\`\`\`${ramUsed} / ${ramTotal} GB\n${createProgressBar(
              mem.active,
              mem.total,
              10
            )}\`\`\``,
            inline: false,
          },
          {
            name: "💾 Disk",
            value: `\`\`\`${diskUsed.toFixed(1)} / ${diskTotal.toFixed(
              1
            )} GB\n${createProgressBar(diskUsed, diskTotal, 10)}\`\`\``,
            inline: false,
          },
          {
            name: "⏱️ Uptime",
            value: `Server: \`${formatUptime(uptime)}\`\nBot: \`${formatUptime(
              processUptime
            )}\``,
            inline: true,
          },
          {
            name: "🤖 Bot",
            value: `Servers: \`${guilds}\`\nQueues: \`${activeQueues}\``,
            inline: true,
          },
          {
            name: "🔧 Runtime",
            value: `Node.js ${process.version}`,
            inline: true,
          }
        )
        .setFooter({ text: "🟢 Server Online" })
        .setTimestamp();

      await msg.edit({ content: "", embeds: [embed] });
    } catch (error) {
      console.error(error);
      msg.edit(`❌ เกิดข้อผิดพลาด: ${(error as Error).message}`);
    }
  },
};

export default command;
