module.exports = {
  name: "leave",
  aliases: ["disconnect", "dc"],
  description: "Leave voice channel",
  execute(message, args, client) {
    const queue = client.queues?.get(message.guild.id);

    if (queue && queue.connection) {
      queue.songs = [];
      queue.nowPlaying = null;
      queue.connection.destroy();
      client.queues.delete(message.guild.id);
      message.reply("👋 ลาก่อนนะคะ~ ไว้เรียกหนูมาเล่นเพลงอีกนะคะ! 🥺");
    } else {
      message.reply("❌ หนูไม่ได้อยู่ในห้องเสียงค่ะ~ 😭");
    }
  },
};
