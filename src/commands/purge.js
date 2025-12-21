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
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply("❌ กรุณาระบุจำนวน 1-100 นะคะ~");
    }

    try {
      const deleted = await message.channel.bulkDelete(amount + 1, true);

      const actualDeleted = deleted.size - 1;
      let replyText = `🗑️ ลบไป **${actualDeleted}** ข้อความแล้วค่ะ~ ✨`;

      // If deleted less than requested, some messages were probably too old
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
