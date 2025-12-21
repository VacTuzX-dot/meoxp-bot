module.exports = {
  name: "loop",
  description: "Toggle loop mode",
  execute(message, args, client) {
    const queue = client.queues?.get(message.guild.id);
    if (!queue) return message.reply("❌ ไม่มีการเล่นเพลงอยู่ค่ะ~");

    // Cycle modes: 0 -> 1 -> 2 -> 0
    queue.loopMode = (queue.loopMode + 1) % 3;

    let modeStr = "";
    if (queue.loopMode === 0) modeStr = "➡️ ปิด Loop แล้วค่ะ~";
    else if (queue.loopMode === 1) modeStr = "🔂 Loop เพลงเดียวค่ะ~";
    else modeStr = "🔁 Loop ทั้งหมดค่ะ~";

    message.reply(modeStr);
  },
};
