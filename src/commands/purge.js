module.exports = {
  name: "purge",
  aliases: ["clean", "del"],
  description: "Bulk delete messages",
  async execute(message, args, client) {
    if (
      !message.member.permissions.has("ManageMessages") &&
      message.author.id !== process.env.OWNER_ID
    ) {
      return message.reply("⛔ คุณไม่มีสิทธิ์ใช้คำสั่งนี้นะคะ~");
    }

    const amount = parseInt(args[0]);
    // Max is 99 because we add +1 for the command itself (Discord API limit is 100)
    if (isNaN(amount) || amount < 1 || amount > 99) {
      return message.reply("❌ กรุณาระบุจำนวน 1-99 นะคะ~");
    }

    try {
      // +1 to delete the command message itself
      // true = filter out messages older than 14 days (Discord API limitation)
      const deleted = await message.channel.bulkDelete(amount + 1, true);

      const actualDeleted = deleted.size - 1; // -1 because we don't count the command
      let replyText = `🗑️ ลบไป **${actualDeleted}** ข้อความแล้วค่ะ~ ✨`;

      // If we deleted less than requested, some messages were probably too old
      if (actualDeleted < amount) {
        replyText += `\n⚠️ ข้อความบางส่วนเก่าเกิน 14 วัน ลบไม่ได้ค่ะ (ข้อจำกัดของ Discord)`;
      }

      const reply = await message.channel.send(replyText);
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch (error) {
      console.error(error);
      message.reply(
        "❌ ไม่สามารถลบข้อความได้ค่ะ\n⚠️ Discord ไม่อนุญาตให้ลบข้อความที่เก่าเกิน 14 วันแบบ bulk ค่ะ 🥺"
      );
    }
  },
};
