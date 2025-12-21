import { Message, TextChannel } from "discord.js";
import { ExtendedClient, Command } from "../types";

const command: Command = {
  name: "purge",
  aliases: ["delete"],
  description: "Delete messages (max 100)",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    // Owner check
    if (message.author.id !== process.env.OWNER_ID) {
      message.reply("⛔ ขอโทษนะคะ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ค่ะ 🙏");
      return;
    }

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      message.reply("❌ กรุณาระบุจำนวน 1-100 ค่ะ~");
      return;
    }

    try {
      const channel = message.channel as TextChannel;

      // Delete the command message first
      await message.delete().catch(() => {});

      // Fetch and delete messages (max 100 per bulkDelete)
      const deleted = await channel.bulkDelete(amount, true);

      let replyText = `🗑️ ลบไป **${deleted.size}** ข้อความแล้วค่ะ~ ✨`;

      if (deleted.size < amount) {
        replyText += `\n⚠️ ข้อความบางส่วนเก่าเกิน 14 วัน ลบไม่ได้ค่ะ`;
      }

      const reply = await channel.send(replyText);
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    } catch (error) {
      const errMsg = await (message.channel as TextChannel).send(
        `❌ เกิดข้อผิดพลาด: ${(error as Error).message}`
      );
      setTimeout(() => errMsg.delete().catch(() => {}), 5000);
    }
  },
};

export default command;
