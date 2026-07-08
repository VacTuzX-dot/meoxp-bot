import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ComponentType,
} from "discord.js";
import { ExtendedClient, Command } from "../types";
import { trackToSong } from "../lib/MoodenglinkManager";

const command: Command = {
  name: "panel",
  aliases: ["control", "c"],
  description: "Show music control panel",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const loopModes = ["➡️ Off", "🔂 Song", "🔁 Queue"];

    const getPlayer = () => client.manager.get(message.guild!.id);

    const createEmbed = () => {
      const player = getPlayer();

      if (!player || !player.queue.current) {
        return new EmbedBuilder()
          .setTitle("🎛️ Music Control Panel")
          .setDescription(
            "*ไม่มีเพลงที่กำลังเล่นค่ะ~*\n\nใช้ `!!play <เพลง>` เพื่อเริ่มเล่นเพลง"
          )
          .setColor(0x2f3136)
          .setFooter({ text: "💕 Ready to play music~" });
      }

      const song = trackToSong(player.queue.current);
      const isPaused = player.paused;
      const statusEmoji = isPaused ? "⏸️" : "▶️";
      const statusText = isPaused ? "Paused" : "Playing";

      return new EmbedBuilder()
        .setTitle("🎛️ Music Control Panel")
        .setDescription(
          `${statusEmoji} **${statusText}**\n\n🎵 **${song.title}**`
        )
        .setColor(isPaused ? 0xffa500 : 0x00ff88)
        .addFields(
          {
            name: "🎤 Artist",
            value: song.uploader || "Unknown",
            inline: true,
          },
          {
            name: "⏱️ Duration",
            value: song.durationInfo || "Unknown",
            inline: true,
          },
          {
            name: "🔄 Loop",
            value: loopModes[player.repeatMode] || loopModes[0],
            inline: true,
          },
          {
            name: "📋 Queue",
            value: `${player.queue.length} songs`,
            inline: true,
          },
          {
            name: "👤 Requested by",
            value: song.requester || "Unknown",
            inline: true,
          },
          { name: "🔊 Volume", value: "100%", inline: true }
        )
        .setThumbnail(song.thumbnail || null)
        .setFooter({ text: "💕 Use buttons below to control playback" });
    };

    const createButtons = () => {
      const player = getPlayer();
      const isPaused = player?.paused ?? false;
      const hasQueue = !!player && player.queue.length > 0;

      const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("panel_prev")
          .setEmoji("⏮️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("panel_pause")
          .setEmoji(isPaused ? "▶️" : "⏸️")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("panel_skip")
          .setEmoji("⏭️")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("panel_stop")
          .setEmoji("⏹️")
          .setStyle(ButtonStyle.Danger)
      );

      const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("panel_shuffle")
          .setEmoji("🔀")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!hasQueue),
        new ButtonBuilder()
          .setCustomId("panel_loop")
          .setEmoji("🔁")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("panel_queue")
          .setEmoji("📋")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("panel_refresh")
          .setEmoji("🔄")
          .setStyle(ButtonStyle.Success)
      );

      return [row1, row2];
    };

    const reply = await message.reply({
      embeds: [createEmbed()],
      components: createButtons(),
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 300000, // 5 minutes
    });

    collector.on("collect", async (interaction: ButtonInteraction) => {
      const member = interaction.guild?.members.cache.get(interaction.user.id);
      if (!member?.voice.channel) {
        await interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องเสียงค่ะ~",
          ephemeral: true,
        });
        return;
      }

      const player = getPlayer();

      switch (interaction.customId) {
        case "panel_pause":
          if (player) {
            const isPaused = player.paused;
            await player.pause(!isPaused);
            await interaction.update({
              embeds: [createEmbed()],
              components: createButtons(),
            });
          } else {
            await interaction.reply({
              content: "❌ ไม่มีเพลงค่ะ~",
              ephemeral: true,
            });
          }
          break;

        case "panel_skip":
          if (player) {
            await player.skip();
            await interaction.reply({
              content: "⏭️ ข้ามเพลงแล้วค่ะ~",
              ephemeral: true,
            });
          } else {
            await interaction.reply({
              content: "❌ ไม่มีเพลงค่ะ~",
              ephemeral: true,
            });
          }
          break;

        case "panel_stop":
          if (player) {
            await player.stop();
            await interaction.reply({
              content: "⏹️ หยุดเล่นแล้วค่ะ~",
              ephemeral: true,
            });
          }
          break;

        case "panel_shuffle":
          if (player && player.queue.length > 1) {
            player.queue.shuffle();
            await interaction.reply({
              content: "🔀 Shuffled!",
              ephemeral: true,
            });
          } else {
            await interaction.reply({
              content: "❌ ไม่พอสับค่ะ~",
              ephemeral: true,
            });
          }
          break;

        case "panel_loop":
          if (player) {
            player.setRepeatMode((player.repeatMode + 1) % 3);
            const modes = ["➡️ Loop Off", "🔂 Loop Song", "🔁 Loop Queue"];
            await interaction.reply({
              content: modes[player.repeatMode],
              ephemeral: true,
            });
            await reply.edit({
              embeds: [createEmbed()],
              components: createButtons(),
            });
          }
          break;

        case "panel_queue":
          if (player && player.queue.length > 0) {
            const queueList = player.queue
              .slice(0, 5)
              .map((item) => trackToSong(item as any));
            let text = "📋 **Queue:**\n";
            queueList.forEach((s, i) => {
              text += `${i + 1}. ${s.title}\n`;
            });
            if (player.queue.length > 5) {
              text += `*...และอีก ${player.queue.length - 5} เพลง*`;
            }
            await interaction.reply({ content: text, ephemeral: true });
          } else {
            await interaction.reply({
              content: "📋 Queue ว่างค่ะ~",
              ephemeral: true,
            });
          }
          break;

        case "panel_refresh":
          await interaction.update({
            embeds: [createEmbed()],
            components: createButtons(),
          });
          break;
      }
    });

    collector.on("end", () => {
      reply.edit({ components: [] }).catch(() => {});
    });
  },
};

export default command;
