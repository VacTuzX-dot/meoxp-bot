import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  ComponentType,
} from "discord.js";
import { ExtendedClient, Command } from "../types";

const categories: Record<
  string,
  { title: string; description: string; fields?: any[] }
> = {
  home: {
    title: "Help Menu",
    description: "Select a category from the menu below.",
  },
  music: {
    title: "Music Commands",
    description: "Commands for playing music.",
    fields: [
      { name: "!!play <query>", value: "Play music", inline: true },
      { name: "!!skip", value: "Skip track", inline: true },
      { name: "!!stop", value: "Pause", inline: true },
      { name: "!!resume", value: "Resume", inline: true },
      { name: "!!queue", value: "View queue", inline: true },
      { name: "!!np", value: "Now playing", inline: true },
      { name: "!!loop", value: "Toggle loop", inline: true },
      { name: "!!shuffle", value: "Shuffle queue", inline: true },
      { name: "!!clear", value: "Clear queue", inline: true },
      { name: "!!join", value: "Join (persistent)", inline: true },
      { name: "!!leave", value: "Leave channel", inline: true },
      { name: "!!panel", value: "Control panel", inline: true },
    ],
  },
  tts: {
    title: "TTS Commands",
    description: "Text-to-Speech commands.",
    fields: [
      { name: "!!say <text>", value: "Speak in Thai", inline: true },
      { name: "!!say -e <text>", value: "Speak in English", inline: true },
    ],
  },
  admin: {
    title: "Admin Commands",
    description: "Admin only commands.",
    fields: [
      { name: "!!purge <n>", value: "Delete messages", inline: true },
      { name: "!!status", value: "Bot status", inline: true },
    ],
  },
};

const command: Command = {
  name: "help",
  aliases: ["h", "?"],
  description: "Show help menu",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("help_menu")
        .setPlaceholder("Select category...")
        .addOptions([
          { label: "Home", value: "home" },
          { label: "Music", value: "music" },
          { label: "TTS", value: "tts" },
          { label: "Admin", value: "admin" },
        ])
    );

    const createEmbed = (category: string) => {
      const data = categories[category] || categories.home;
      const embed = new EmbedBuilder()
        .setTitle(data.title)
        .setDescription(data.description)
        .setColor(0xff69b4)
        .setFooter({ text: "Prefix: !! | เลือกหมวดหมู่จากเมนูด้านล่าง 🩷" });

      if (data.fields) {
        embed.addFields(data.fields);
      }

      return embed;
    };

    const reply = await message.reply({
      embeds: [createEmbed("home")],
      components: [row],
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60000,
    });

    collector.on(
      "collect",
      async (interaction: StringSelectMenuInteraction) => {
        if (interaction.user.id !== message.author.id) {
          await interaction.reply({
            content: "❌ นี่ไม่ใช่เมนูของคุณค่ะ~",
            ephemeral: true,
          });
          return;
        }

        const category = interaction.values[0];
        await interaction.update({ embeds: [createEmbed(category)] });
      }
    );

    collector.on("end", () => {
      reply.edit({ components: [] }).catch(() => {});
    });
  },
};

export default command;
