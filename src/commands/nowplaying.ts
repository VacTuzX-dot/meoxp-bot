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

// Create progress bar
function createProgressBar(
  current: number,
  total: number,
  length: number = 15
): string {
  if (!total || total === 0) return "▬".repeat(length);

  const progress = Math.min(current / total, 1);
  const filledLength = Math.round(progress * length);
  const emptyLength = length - filledLength;

  return "▓".repeat(filledLength) + "░".repeat(emptyLength);
}

// Format time
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const command: Command = {
  name: "nowplaying",
  aliases: ["np"],
  description: "Show the currently playing song with controls",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const queue = client.queues.get(message.guild!.id);

    if (!queue || !queue.nowPlaying) {
      message.reply("❌ ไม่มีเพลงที่กำลังเล่นอยู่ค่ะ~");
      return;
    }

    const song = queue.nowPlaying;
    const loopModes = ["➡️ ปิด", "🔂 เพลงเดียว", "🔁 ทั้ง Queue"];
    const loopEmojis = ["➡️", "🔂", "🔁"];

    // Get current position from player
    const position = queue.player?.position || 0;
    const duration = song.duration * 1000 || 0;
    const progressBar = createProgressBar(position, duration);
    const currentTime = formatTime(position / 1000);
    const totalTime = song.durationInfo || formatTime(song.duration);

    const embed = new EmbedBuilder()
      .setTitle("🎵 Now Playing")
      .setDescription(
        `**${song.title}**\n\n${progressBar}\n\`${currentTime} / ${totalTime}\``
      )
      .setColor(0x00ff88)
      .addFields(
        { name: "🎤 Artist", value: song.uploader || "Unknown", inline: true },
        {
          name: "👤 Requested by",
          value: song.requester || "Unknown",
          inline: true,
        },
        { name: "🔄 Loop", value: loopModes[queue.loopMode], inline: true },
        {
          name: "📋 Queue",
          value: `${queue.songs.length} songs`,
          inline: true,
        },
        { name: "🔊 Quality", value: "`OPUS • 128kbps`", inline: true }
      )
      .setFooter({ text: "💕 Use buttons below to control playback" });

    if (song.thumbnail) embed.setThumbnail(song.thumbnail);

    // Control buttons
    const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("np_prev")
        .setEmoji("⏮️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true), // No previous for now
      new ButtonBuilder()
        .setCustomId("np_pause")
        .setEmoji(queue.player?.paused ? "▶️" : "⏸️")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("np_skip")
        .setEmoji("⏭️")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("np_stop")
        .setEmoji("⏹️")
        .setStyle(ButtonStyle.Danger)
    );

    const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("np_shuffle")
        .setEmoji("🔀")
        .setLabel("Shuffle")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("np_loop")
        .setEmoji(loopEmojis[queue.loopMode])
        .setLabel("Loop")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("np_queue")
        .setEmoji("📋")
        .setLabel("Queue")
        .setStyle(ButtonStyle.Secondary)
    );

    const reply = await message.reply({
      embeds: [embed],
      components: [row1, row2],
    });

    // Button collector
    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000, // 2 minutes
    });

    collector.on("collect", async (interaction: ButtonInteraction) => {
      // Check if user is in voice channel
      const member = interaction.guild?.members.cache.get(interaction.user.id);
      if (!member?.voice.channel) {
        await interaction.reply({
          content: "❌ คุณต้องอยู่ในห้องเสียงค่ะ~",
          ephemeral: true,
        });
        return;
      }

      const currentQueue = client.queues.get(message.guild!.id);
      if (!currentQueue || !currentQueue.player) {
        await interaction.reply({
          content: "❌ ไม่มีเพลงที่กำลังเล่นค่ะ~",
          ephemeral: true,
        });
        return;
      }

      switch (interaction.customId) {
        case "np_pause":
          const isPaused = currentQueue.player.paused;
          await currentQueue.player.setPaused(!isPaused);
          await interaction.reply({
            content: isPaused
              ? "▶️ เล่นต่อแล้วค่ะ~"
              : "⏸️ หยุดชั่วคราวแล้วค่ะ~",
            ephemeral: true,
          });
          break;

        case "np_skip":
          currentQueue.player.stopTrack();
          await interaction.reply({
            content: "⏭️ ข้ามเพลงแล้วค่ะ~",
            ephemeral: true,
          });
          break;

        case "np_stop":
          currentQueue.songs = [];
          currentQueue.player.stopTrack();
          await interaction.reply({
            content: "⏹️ หยุดเล่นและล้าง Queue แล้วค่ะ~",
            ephemeral: true,
          });
          break;

        case "np_shuffle":
          if (currentQueue.songs.length > 1) {
            for (let i = currentQueue.songs.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [currentQueue.songs[i], currentQueue.songs[j]] = [
                currentQueue.songs[j],
                currentQueue.songs[i],
              ];
            }
            await interaction.reply({
              content: "🔀 สับ Queue แล้วค่ะ~",
              ephemeral: true,
            });
          } else {
            await interaction.reply({
              content: "❌ Queue มีไม่พอสับค่ะ~",
              ephemeral: true,
            });
          }
          break;

        case "np_loop":
          currentQueue.loopMode = (currentQueue.loopMode + 1) % 3;
          const modes = [
            "➡️ ปิด Loop",
            "🔂 Loop เพลงเดียว",
            "🔁 Loop ทั้ง Queue",
          ];
          await interaction.reply({
            content: `${modes[currentQueue.loopMode]}`,
            ephemeral: true,
          });
          break;

        case "np_queue":
          const queueList = currentQueue.songs.slice(0, 5);
          let queueText = "📋 **Queue:**\n";
          if (queueList.length === 0) {
            queueText += "ว่างเปล่าค่ะ~";
          } else {
            queueList.forEach((s, i) => {
              queueText += `${i + 1}. ${s.title}\n`;
            });
            if (currentQueue.songs.length > 5) {
              queueText += `...และอีก ${currentQueue.songs.length - 5} เพลง`;
            }
          }
          await interaction.reply({
            content: queueText,
            ephemeral: true,
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
