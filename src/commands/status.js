const { EmbedBuilder } = require('discord.js');
const si = require('systeminformation');

module.exports = {
    name: 'server',
    aliases: ['status', 'sysinfo'],
    description: 'Show server status',
    async execute(message, args, client) {
        // Owner check
         if (message.author.id !== process.env.OWNER_ID) {
            return message.reply('⛔ ขอโทษนะคะ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ค่ะ 🙏');
        }

        const msg = await message.reply('🔄 กำลังเก็บข้อมูล Server...');

        try {
            const [cpu, mem, osInfo, disk, docker] = await Promise.all([
                si.cpuCurrentSpeed(),
                si.mem(),
                si.osInfo(),
                si.fsSize(),
                si.dockerContainers()
            ]);

            const uptime = si.time().uptime;
            const uptimeStr = new Date(uptime * 1000).toISOString().substr(11, 8); // Simple formatting

            // Docker formatting
            const runningContainers = docker.filter(c => c.state === 'running').length;

            const embed = new EmbedBuilder()
                .setTitle(`🖥️ Server Status: ${osInfo.hostname}`)
                .setColor(0x00FF00)
                .addFields(
                    { name: '🐧 OS', value: `${osInfo.distro} ${osInfo.release}`, inline: true },
                    { name: '⏱️ Uptime', value: `${(uptime / 3600).toFixed(1)} hrs`, inline: true },
                    { name: '💻 CPU', value: `${cpu.avg} GHz`, inline: true },
                    { name: '🧠 RAM', value: `${(mem.active / 1024 / 1024 / 1024).toFixed(1)}/${(mem.total / 1024 / 1024 / 1024).toFixed(1)} GB`, inline: true },
                    { name: '💾 Disk', value: `${(disk[0].used / 1024 / 1024 / 1024).toFixed(1)} GB used`, inline: true },
                    { name: '🐳 Docker', value: `${runningContainers} Running`, inline: true }
                )
                .setFooter({ text: '🟢 Server Online' });

            await msg.edit({ content: '', embeds: [embed] });
        } catch (error) {
            console.error(error);
            msg.edit(`❌ เกิดข้อผิดพลาด: ${error.message}`);
        }
    }
};
