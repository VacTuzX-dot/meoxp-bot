import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  import { Message } from "discord.js";
> = {
  import {
    attachHelpCollector,
    createHelpEmbed,
    createHelpRow,
  } from "../lib/helpMenu";
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient,
  ): Promise<void> {
    const reply = await message.reply({
      embeds: [createHelpEmbed("home")],
      components: [createHelpRow()],
    });

    attachHelpCollector(reply, message.author.id);
  },
};

export default command;
