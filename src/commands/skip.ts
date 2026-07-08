import { Message } from "discord.js";
import { ExtendedClient, Command } from "../types";

const command: Command = {
  name: "skip",
  aliases: ["s", "next"],
  description: "Skip the current song",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const player = client.manager.get(message.guild!.id);

    if (!player || !player.queue.current) {
      message.reply("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะนายท่าน~");
      return;
    }

    const skippedTitle = player.queue.current.title || "เพลง";
    await player.skip();
    message.reply(`⏭️ ข้ามเพลง **${skippedTitle}** แล้วค่ะนายท่าน~ 🎵`);
  },
};

export default command;
