import { Message } from "discord.js";
import { ExtendedClient, Command } from "../types";

const command: Command = {
  name: "stop",
  aliases: ["pause"],
  description: "Stop the current song",
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

    queue.player.setPaused(true);
    message.reply(
      "⏸️ หยุดเพลงชั่วคราวแล้วค่ะนายท่าน~ ใช้ `!!resume` เพื่อเล่นต่อนะคะ 💕"
    );
  },
};

export default command;
