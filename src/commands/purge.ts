import { Message, TextChannel } from "discord.js";
import { ExtendedClient, Command } from "../types";

const command: Command = {
  name: "purge",
  aliases: ["clear", "delete"],
  description: "Delete messages",
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
      const deleted = await channel.bulkDelete(amount + 1, true);

      const actualDeleted = deleted.size - 1;
      let replyText = `🗑️ ลบไป **${actualDeleted}** ข้อความแล้วค่ะ~ ✨`;

      if (actualDeleted < amount) {
        replyText += `\n⚠️ ข้อความบางส่วนเก่าเกิน 14 วัน ลบไม่ได้ค่ะ`;
      }

      const reply = await channel.send(replyText);
      setTimeout(() => reply.delete().catch(() => {}), 3000);
    } catch (error) {
      message.reply(`❌ เกิดข้อผิดพลาด: ${(error as Error).message}`);
    }
  },
};

export default command;
