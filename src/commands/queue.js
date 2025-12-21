const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'queue',
    aliases: ['q', 'list'],
    description: 'Show current queue',
    execute(message, args, client) {
        const queue = client.queues?.get(message.guild.id);
        
        if (!queue || (!queue.nowPlaying && queue.songs.length === 0)) {
            return message.reply('📭 Queue ว่างเปล่าค่ะ~ ขอเพลงได้เลยนะคะ! 🎵');
        }

        const embed = new EmbedBuilder()
            .setTitle('🎵 รายการเพลง')
            .setColor(0xFF69B4);

        if (queue.nowPlaying) {
            embed.addFields({
                name: '🎶 กำลังเล่น',
                value: `**${queue.nowPlaying.title}**\nขอโดย: ${queue.nowPlaying.requester}`
            });
        }

        if (queue.songs.length > 0) {
            const list = queue.songs.slice(0, 10).map((song, i) => {
                return `\`${i + 1}.\` ${song.title} [${song.durationInfo || 'Unknown'}]`;
            }).join('\n');

            const remaining = queue.songs.length > 10 ? `\n... และอีก ${queue.songs.length - 10} เพลงค่ะ` : '';
            embed.addFields({ name: '📋 ถัดไป', value: list + remaining });
        }

        embed.setFooter({ text: `ทั้งหมด ${queue.songs.length} เพลงใน Queue ค่ะ 💕` });
        message.channel.send({ embeds: [embed] });
    }
};
