import { Events, Interaction } from "discord.js";
import { ExtendedClient, defineEvent } from "../types";
import { handleSlashCommand } from "../lib/slashCommands";

const event = defineEvent({
  name: Events.InteractionCreate,
  async execute(interaction: Interaction, client: ExtendedClient) {
    if (!interaction.isChatInputCommand()) return;

    await handleSlashCommand(interaction, client);
  },
});

export default event;
