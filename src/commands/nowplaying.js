const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'nowplaying',
    aliases: ['np'],
    description: 'Show currently playing song',
    execute(message, args, client) {
        const queue = client.queues?.get(message.guild.id);
        
        if (!queue || !queue.nowPlaying) {
            return message.reply('❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~');
        }

        const song = queue.nowPlaying;
        const embed = new EmbedBuilder()
            .setTitle('🎶 กำลังเล่นอยู่ค่ะ~')
            .setColor(0xFF69B4)
            .addFields(
                { name: '🎵 เพลง', value: `**${song.title}**` },
                { name: '⏱️ ความยาว', value: song.durationInfo || 'Unknown', inline: true },
                { name: '👤 ขอโดย', value: song.requester, inline: true }
            )
            .setFooter({ text: 'เพลงเพราะมากเลยค่ะ~ 💕' });

        if (song.thumbnail) embed.setThumbnail(song.thumbnail);

        message.channel.send({ embeds: [embed] });
    }
};
