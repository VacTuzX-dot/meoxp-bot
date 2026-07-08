import { Message } from "discord.js";
import { ExtendedClient, Command } from "../types";

const command: Command = {
  name: "shuffle",
  aliases: ["random", "mix"],
  description: "Shuffle the queue",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const player = client.manager.get(message.guild!.id);

    if (!player || player.queue.length === 0) {
      message.reply("❌ ไม่มีเพลงใน Queue ให้สับนะคะนายท่าน~ 🥺");
      return;
    }

    if (player.queue.length < 2) {
      message.reply("❌ ต้องมีเพลงอย่างน้อย 2 เพลงถึงจะสับได้นะคะนายท่าน~");
      return;
    }

    player.queue.shuffle();
    message.reply(
      `🔀 สับ Queue แล้วค่ะนายท่าน~ (${player.queue.length} เพลง) ✨`
    );
  },
};

export default command;
