import { Message } from "discord.js";
import { ExtendedClient, Command } from "../types";

const command: Command = {
  name: "resume",
  aliases: ["unpause", "r"],
  description: "Resume the paused song",
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

    await player.pause(false);
    message.reply("▶️ เล่นเพลงต่อแล้วค่ะนายท่าน~ 🎵✨");
  },
};

export default command;
