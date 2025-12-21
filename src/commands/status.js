const { EmbedBuilder } = require("discord.js");
const si = require("systeminformation");
const os = require("os");

module.exports = {
  name: "server",
  aliases: ["status", "sysinfo", "sys"],
  description: "Show detailed server status",
  async execute(message, args, client) {
    // Owner check
    if (message.author.id !== process.env.OWNER_ID) {
      return message.reply("⛔ ขอโทษนะคะ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ค่ะ 🙏");
    }

    const msg = await message.reply("🔄 กำลังเก็บข้อมูล Server...");

    try {
      const [cpu, cpuInfo, mem, osInfo, disk, docker, networkStats, load] =
        await Promise.all([
          si.cpuCurrentSpeed(),
          si.cpu(),
          si.mem(),
          si.osInfo(),
          si.fsSize(),
          si.dockerContainers(),
          si.networkStats(),
          si.currentLoad(),
        ]);

      const uptime = si.time().uptime;
      const processUptime = process.uptime();

      // Format uptime
      function formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        let result = [];
        if (days > 0) result.push(`${days}d`);
        if (hours > 0) result.push(`${hours}h`);
        if (mins > 0) result.push(`${mins}m`);
        if (secs > 0 || result.length === 0) result.push(`${secs}s`);
        return result.join(" ");
      }

      // Docker formatting
      const runningContainers = docker.filter((c) => c.state === "running");
      const dockerList =
        runningContainers.length > 0
          ? runningContainers
              .slice(0, 5)
              .map((c) => `\`${c.name}\``)
              .join(", ")
          : "ไม่มี";

      // RAM calculations
      const ramUsed = (mem.active / 1024 / 1024 / 1024).toFixed(2);
      const ramTotal = (mem.total / 1024 / 1024 / 1024).toFixed(2);
      const ramPercent = ((mem.active / mem.total) * 100).toFixed(1);

      // Swap
      const swapUsed = (mem.swapused / 1024 / 1024 / 1024).toFixed(2);
      const swapTotal = (mem.swaptotal / 1024 / 1024 / 1024).toFixed(2);

      // Disk calculations
      const diskUsed = (disk[0].used / 1024 / 1024 / 1024).toFixed(1);
      const diskTotal = (disk[0].size / 1024 / 1024 / 1024).toFixed(1);
      const diskPercent = disk[0].use.toFixed(1);

      // Network
      const netRx = networkStats[0]
        ? (networkStats[0].rx_sec / 1024 / 1024).toFixed(2)
        : 0;
      const netTx = networkStats[0]
        ? (networkStats[0].tx_sec / 1024 / 1024).toFixed(2)
        : 0;

      // Bot stats
      const guilds = client.guilds.cache.size;
      const users = client.users.cache.size;
      const activeQueues = client.queues?.size || 0;

      // Memory usage of this process
      const nodeMemUsed = (
        process.memoryUsage().heapUsed /
        1024 /
        1024
      ).toFixed(1);
      const nodeMemTotal = (
        process.memoryUsage().heapTotal /
        1024 /
        1024
      ).toFixed(1);

      // CPU progress bar
      const cpuPercent = load.currentLoad.toFixed(1);
      const cpuBar = createProgressBar(load.currentLoad, 100, 10);
      const ramBar = createProgressBar(mem.active, mem.total, 10);
      const diskBar = createProgressBar(disk[0].used, disk[0].size, 10);

      function createProgressBar(current, total, length) {
        const percent = (current / total) * 100;
        const filled = Math.round((percent / 100) * length);
        const empty = length - filled;
        return "█".repeat(filled) + "░".repeat(empty);
      }

      const embed = new EmbedBuilder()
        .setTitle(`🖥️ Server Status`)
        .setColor(0x00ff88)
        .setDescription(
          `**${osInfo.hostname}** • ${osInfo.distro} ${osInfo.release}`
        )
        .addFields(
          {
            name: "💻 CPU",
            value: `\`\`\`${cpuInfo.manufacturer} ${cpuInfo.brand}\n${
              cpuInfo.cores
            } cores @ ${
              cpu.avg || cpu.min
            } GHz\n${cpuBar} ${cpuPercent}%\`\`\``,
            inline: false,
          },
          {
            name: "🧠 RAM",
            value: `\`\`\`${ramUsed} / ${ramTotal} GB (${ramPercent}%)\n${ramBar}\nSwap: ${swapUsed} / ${swapTotal} GB\`\`\``,
            inline: false,
          },
          {
            name: "💾 Disk",
            value: `\`\`\`${diskUsed} / ${diskTotal} GB (${diskPercent}%)\n${diskBar}\nMount: ${disk[0].mount}\`\`\``,
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
            name: "🌐 Network",
            value: `⬇️ ${netRx} MB/s\n⬆️ ${netTx} MB/s`,
            inline: true,
          },
          {
            name: "🐳 Docker",
            value: `${runningContainers.length} running\n${dockerList}`,
            inline: true,
          },
          {
            name: "🤖 Bot Stats",
            value: `Servers: \`${guilds}\`\nUsers: \`${users}\`\nQueues: \`${activeQueues}\``,
            inline: true,
          },
          {
            name: "📦 Node.js",
            value: `${process.version}\nMemory: ${nodeMemUsed}/${nodeMemTotal} MB`,
            inline: true,
          },
          {
            name: "🔧 Runtime",
            value: `Bun ${process.versions.bun || "N/A"}\nPlatform: ${
              process.platform
            }`,
            inline: true,
          }
        )
        .setFooter({ text: "🟢 Server Online | Last updated" })
        .setTimestamp();

      await msg.edit({ content: "", embeds: [embed] });
    } catch (error) {
      console.error(error);
      msg.edit(`❌ เกิดข้อผิดพลาด: ${error.message}`);
    }
  },
};
