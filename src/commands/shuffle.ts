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
    const queue = client.queues.get(message.guild!.id);

    if (!queue || queue.songs.length === 0) {
      message.reply("❌ ไม่มีเพลงใน Queue ให้สับนะคะนายท่าน~ 🥺");
      return;
    }

    if (queue.songs.length < 2) {
      message.reply("❌ ต้องมีเพลงอย่างน้อย 2 เพลงถึงจะสับได้นะคะนายท่าน~");
      return;
    }

    const songs = queue.songs;
    for (let i = songs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [songs[i], songs[j]] = [songs[j], songs[i]];
    }

    message.reply(`🔀 สับ Queue แล้วค่ะนายท่าน~ (${songs.length} เพลง) ✨`);
  },
};

export default command;
