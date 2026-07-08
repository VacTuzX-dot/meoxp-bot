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
    const player = client.manager.get(message.guild!.id);

    if (!player || !player.queue.current) {
      message.reply("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะนายท่าน~");
      return;
    }

    await player.pause(true);
    message.reply(
      "⏸️ หยุดเพลงชั่วคราวแล้วค่ะนายท่าน~ ใช้ `!!resume` เพื่อเล่นต่อนะคะ 💕"
    );
  },
};

export default command;
