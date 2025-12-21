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
      message.reply("❌ ไม่มีเพลงที่กำลังเล่นอยู่ค่ะ~");
      return;
    }

    queue.player.setPaused(true);
    message.reply("⏸️ หยุดเพลงชั่วคราวแล้วค่ะ~ (ใช้ !!resume เพื่อเล่นต่อ)");
  },
};

export default command;
