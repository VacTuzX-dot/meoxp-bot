import { Message } from "discord.js";
import { ExtendedClient, Command } from "../types";
import { destroyPlayer } from "../lib/ShoukakuManager";

const command: Command = {
  name: "leave",
  aliases: ["disconnect", "dc"],
  description: "Leave the voice channel",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const queue = client.queues.get(message.guild!.id);

    if (queue?.player) {
      destroyPlayer(client, message.guild!.id);
      message.reply("👋 ลาก่อนนะคะ~ ไว้เรียกหนูมาเล่นเพลงอีกนะคะ! 🥺");
    } else {
      message.reply("❌ หนูไม่ได้อยู่ในห้องเสียงค่ะ~ 😭");
    }
  },
};

export default command;
