import { Message } from "discord.js";
import { ExtendedClient, Command } from "../types";

const command: Command = {
  name: "clear",
  aliases: ["clearqueue", "cq", "cls"],
  description: "Clear the queue",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const player = client.manager.get(message.guild!.id);

    if (!player) {
      message.reply("❌ ไม่มี Queue นะคะนายท่าน~");
      return;
    }

    const count = player.queue.length;
    player.queue.clear();

    message.reply(`🗑️ ล้าง Queue แล้วค่ะนายท่าน~ (${count} เพลง) ✨`);
  },
};

export default command;
