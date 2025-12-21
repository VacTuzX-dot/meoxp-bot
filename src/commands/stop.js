module.exports = {
  name: "stop",
  aliases: ["pause"],
  description: "Stop music but stay in voice channel",
  execute(message, args, client) {
    const queue = client.queues?.get(message.guild.id);

    if (queue && queue.connection) {
      queue.songs = []; // Clear queue
      queue.nowPlaying = null;
      if (queue.player) {
        queue.player.stop(); // Stop playing but don't disconnect
      }
      message.reply("⏹️ หยุดเล่นเพลงแล้วค่ะ~ หนูยังอยู่ในห้องนะคะ 🎀");
    } else {
      message.reply("❌ หนูไม่ได้อยู่ในห้องเสียงค่ะ~");
    }
  },
};
