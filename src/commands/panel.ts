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

const command: Command = {
  name: "panel",
  aliases: ["control", "c"],
  description: "Show music control panel",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const queue = client.queues.get(message.guild!.id);
    const loopModes = ["➡️ Off", "🔂 Song", "🔁 Queue"];

    const createEmbed = () => {
      const currentQueue = client.queues.get(message.guild!.id);

      if (!currentQueue || !currentQueue.nowPlaying) {
        return new EmbedBuilder()
          .setTitle("🎛️ Music Control Panel")
          .setDescription(
            "*ไม่มีเพลงที่กำลังเล่นค่ะ~*\n\nใช้ `!!play <เพลง>` เพื่อเริ่มเล่นเพลง"
          )
          .setColor(0x2f3136)
          .setFooter({ text: "💕 Ready to play music~" });
      }

      const song = currentQueue.nowPlaying;
      const isPaused = currentQueue.player?.paused ?? false;
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
            value: loopModes[currentQueue.loopMode],
            inline: true,
          },
          {
            name: "📋 Queue",
            value: `${currentQueue.songs.length} songs`,
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
      const currentQueue = client.queues.get(message.guild!.id);
      const isPaused = currentQueue?.player?.paused ?? false;
      const hasQueue = currentQueue && currentQueue.songs.length > 0;

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

      const currentQueue = client.queues.get(message.guild!.id);

      switch (interaction.customId) {
        case "panel_pause":
          if (currentQueue?.player) {
            const isPaused = currentQueue.player.paused;
            await currentQueue.player.setPaused(!isPaused);
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
          if (currentQueue?.player) {
            currentQueue.player.stopTrack();
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
          if (currentQueue) {
            currentQueue.songs = [];
            currentQueue.player?.stopTrack();
            await interaction.reply({
              content: "⏹️ หยุดเล่นแล้วค่ะ~",
              ephemeral: true,
            });
          }
          break;

        case "panel_shuffle":
          if (currentQueue && currentQueue.songs.length > 1) {
            for (let i = currentQueue.songs.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [currentQueue.songs[i], currentQueue.songs[j]] = [
                currentQueue.songs[j],
                currentQueue.songs[i],
              ];
            }
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
          if (currentQueue) {
            currentQueue.loopMode = (currentQueue.loopMode + 1) % 3;
            const modes = ["➡️ Loop Off", "🔂 Loop Song", "🔁 Loop Queue"];
            await interaction.reply({
              content: modes[currentQueue.loopMode],
              ephemeral: true,
            });
            await reply.edit({
              embeds: [createEmbed()],
              components: createButtons(),
            });
          }
          break;

        case "panel_queue":
          if (currentQueue && currentQueue.songs.length > 0) {
            const queueList = currentQueue.songs.slice(0, 5);
            let text = "📋 **Queue:**\n";
            queueList.forEach((s, i) => {
              text += `${i + 1}. ${s.title}\n`;
            });
            if (currentQueue.songs.length > 5) {
              text += `*...และอีก ${currentQueue.songs.length - 5} เพลง*`;
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
