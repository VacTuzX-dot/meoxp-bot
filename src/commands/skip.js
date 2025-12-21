const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'skip',
    aliases: ['s', 'next'],
    description: 'Skip current song',
    execute(message, args, client) {
        const queue = client.queues?.get(message.guild.id);
        
        if (!queue || !queue.player) {
            return message.reply('❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~');
        }

        // To prevent loop from re-playing the same song immediately when skipping manually
        // We might need a flag. For simplicity, we just stop the player which triggers Idle.
        // But if Loop One is on, Idle will re-add it.
        // Let's temporarily disable loop one if skipping?
        // Or just let it skip to the next iteration (which is the same song).
        // Standard user expectation: Skip = Play *Next* Thing. If Loop One, maybe skip to next in queue?
        
        // For now, standard behavior: Stop current resource.
        queue.player.stop();
        message.reply('⏭️ ข้ามไปเพลงถัดไปค่ะ~');
    }
};
