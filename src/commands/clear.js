module.exports = {
  name: "clear",
  aliases: ["clearqueue", "cq", "cls"],
  description: "Clear the queue",
  execute(message, args, client) {
    const queue = client.queues?.get(message.guild.id);

    if (!queue) {
      return message.reply("❌ ไม่มี Queue ค่ะ~");
    }

    const count = queue.songs.length;
    queue.songs = [];

    message.reply(`🗑️ ลบเพลงใน Queue แล้ว **${count}** เพลงค่ะ~ ✨`);
  },
};
