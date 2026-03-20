import { Events, Message } from "discord.js";
import { ExtendedClient, defineEvent } from "../types";

const PREFIX = "!!";

const event = defineEvent({
  name: Events.MessageCreate,
  execute(message: Message, client: ExtendedClient) {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;
    if (!message.guild) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    // Get command from commands or aliases
    const aliasCommandName = client.aliases.get(commandName);
    const command =
      client.commands.get(commandName) ||
      (aliasCommandName ? client.commands.get(aliasCommandName) : undefined);

    if (!command) return;

    try {
      command.execute(message, args, client);
    } catch (error) {
      console.error("Command error:", error);
      message.reply("❌ เกิดข้อผิดพลาดค่ะ 🥺");
    }
  },
});

export default event;
