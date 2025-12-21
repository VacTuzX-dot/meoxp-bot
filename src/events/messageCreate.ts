import { Events, Message } from "discord.js";
import { ExtendedClient, Event } from "../types";

const PREFIX = "!!";

const event: Event = {
  name: Events.MessageCreate,
  execute(message: Message, client: ExtendedClient) {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;
    if (!message.guild) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    // Get command from commands or aliases
    const command =
      client.commands.get(commandName) ||
      client.commands.get((client as any).aliases?.get(commandName));

    if (!command) return;

    try {
      command.execute(message, args, client);
    } catch (error) {
      console.error("Command error:", error);
      message.reply("❌ เกิดข้อผิดพลาดค่ะ 🥺");
    }
  },
};

export default event;
