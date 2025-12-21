module.exports = {
    name: 'stop',
    aliases: ['leave', 'disconnect'],
    description: 'Stop music and leave',
    execute(message, args, client) {
        const queue = client.queues?.get(message.guild.id);
        
        if (queue && queue.connection) {
            queue.songs = []; // Clear queue
            queue.nowPlaying = null;
            queue.connection.destroy();
            client.queues.delete(message.guild.id);
            message.reply('👋 ลาก่อนนะคะ~ ไว้เรียกหนูมาเล่นเพลงอีกนะคะ! 🎀');
        } else {
             message.reply('❌ หนูไม่ได้อยู่ในห้องเสียงค่ะ~');
        }
    }
};
