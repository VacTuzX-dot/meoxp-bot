import { Message } from "discord.js";
import { ExtendedClient, Command } from "../types";
import { destroyPlayer } from "../lib/MoodenglinkManager";

const command: Command = {
  name: "leave",
  aliases: ["disconnect", "dc"],
  description: "Leave the voice channel",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const player = client.manager.get(message.guild!.id);

    if (player) {
      destroyPlayer(client, message.guild!.id);
      message.reply(
        "👋 ลาก่อนนะคะนายท่าน~ หนูไปพักก่อนนะคะ ไว้เรียกหนูมาอีกนะคะ! 💕"
      );
    } else {
      message.reply("❓ หนูไม่ได้อยู่ในห้องเสียงนะคะนายท่าน~ 🤔");
    }
  },
};

export default command;
