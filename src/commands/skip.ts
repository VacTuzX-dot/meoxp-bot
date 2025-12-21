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
    const queue = client.queues.get(message.guild!.id);

    if (!queue || !queue.player) {
      message.reply("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะนายท่าน~");
      return;
    }

    const skippedTitle = queue.nowPlaying?.title || "เพลง";
    queue.player.stopTrack();
    message.reply(`⏭️ ข้ามเพลง **${skippedTitle}** แล้วค่ะนายท่าน~ 🎵`);
  },
};

export default command;
