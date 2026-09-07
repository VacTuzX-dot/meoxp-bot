import { Message } from "discord.js";
import { ExtendedClient, Command } from "../types";
import nowplayingCommand from "./nowplaying";

const command: Command = {
  name: "panel",
  aliases: ["control", "c"],
  description: "Show music control panel (alias for nowplaying)",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    return nowplayingCommand.execute(message, args, client);
  },
};

export default command;
