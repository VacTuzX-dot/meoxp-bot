import {
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction,
  ComponentType,
} from "discord.js";
import { ExtendedClient, Command, Song } from "../types";

// Format duration
function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Calculate total duration of queue
function getTotalDuration(songs: Song[]): string {
  const total = songs.reduce((acc, song) => acc + (song.duration || 0), 0);
  return formatDuration(total);
}

const SONGS_PER_PAGE = 10;

const command: Command = {
  name: "queue",
  aliases: ["q"],
  description: "Show the queue with pagination",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const queue = client.queues.get(message.guild!.id);

    if (!queue || (!queue.nowPlaying && queue.songs.length === 0)) {
      message.reply("❌ Queue ว่างเปล่าค่ะ~");
      return;
    }

    const loopModes = ["➡️ Off", "🔂 Song", "🔁 Queue"];
    let currentPage = 0;
    const totalPages = Math.max(
      1,
      Math.ceil(queue.songs.length / SONGS_PER_PAGE)
    );

    const createEmbed = (page: number) => {
      const start = page * SONGS_PER_PAGE;
      const end = start + SONGS_PER_PAGE;
      const songsToShow = queue.songs.slice(start, end);

      let description = "";

      // Now playing
      if (queue.nowPlaying) {
        description += `🎵 **NOW PLAYING**\n`;
        description += `╰➤ [${queue.nowPlaying.title}](${queue.nowPlaying.url})\n`;
        description += `    └ \`${queue.nowPlaying.durationInfo}\` • ${queue.nowPlaying.requester}\n\n`;
      }

      // Queue
      if (queue.songs.length > 0) {
        description += `📋 **QUEUE** (${queue.songs.length} songs)\n`;
        description += `━━━━━━━━━━━━━━━\n`;

        songsToShow.forEach((song, index) => {
          const position = start + index + 1;
          const title =
            song.title.length > 40
              ? song.title.substring(0, 40) + "..."
              : song.title;
          description += `\`${position}.\` ${title}\n`;
          description += `    └ \`${song.durationInfo}\` • ${song.requester}\n`;
        });

        if (queue.songs.length > SONGS_PER_PAGE) {
          description += `━━━━━━━━━━━━━━━\n`;
        }
      } else {
        description += `\n*Queue ว่างเปล่าค่ะ~ ใช้ \`!!play\` เพื่อเพิ่มเพลง*`;
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Music Queue")
        .setDescription(description)
        .setColor(0xff69b4)
        .addFields(
          { name: "🔄 Loop", value: loopModes[queue.loopMode], inline: true },
          {
            name: "⏱️ Total",
            value: getTotalDuration(queue.songs),
            inline: true,
          },
          { name: "📄 Page", value: `${page + 1}/${totalPages}`, inline: true }
        )
        .setFooter({ text: "💕 Enjoy your music~" });

      if (queue.nowPlaying?.thumbnail) {
        embed.setThumbnail(queue.nowPlaying.thumbnail);
      }

      return embed;
    };

    const createButtons = (page: number) => {
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("queue_first")
          .setEmoji("⏮️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId("queue_prev")
          .setEmoji("◀️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId("queue_page")
          .setLabel(`${page + 1}/${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("queue_next")
          .setEmoji("▶️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page >= totalPages - 1),
        new ButtonBuilder()
          .setCustomId("queue_last")
          .setEmoji("⏭️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages - 1)
      );

      const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("queue_shuffle")
          .setEmoji("🔀")
          .setLabel("Shuffle")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("queue_clear")
          .setEmoji("🗑️")
          .setLabel("Clear")
          .setStyle(ButtonStyle.Danger)
      );

      return queue.songs.length > SONGS_PER_PAGE ? [row, row2] : [row2];
    };

    const reply = await message.reply({
      embeds: [createEmbed(currentPage)],
      components: createButtons(currentPage),
    });

    const collector = reply.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000,
    });

    collector.on("collect", async (interaction: ButtonInteraction) => {
      const currentQueue = client.queues.get(message.guild!.id);

      switch (interaction.customId) {
        case "queue_first":
          currentPage = 0;
          break;
        case "queue_prev":
          currentPage = Math.max(0, currentPage - 1);
          break;
        case "queue_next":
          currentPage = Math.min(totalPages - 1, currentPage + 1);
          break;
        case "queue_last":
          currentPage = totalPages - 1;
          break;
        case "queue_shuffle":
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
            await reply.edit({
              embeds: [createEmbed(currentPage)],
              components: createButtons(currentPage),
            });
            return;
          }
          await interaction.reply({
            content: "❌ ไม่พอสับค่ะ~",
            ephemeral: true,
          });
          return;
        case "queue_clear":
          if (currentQueue) {
            currentQueue.songs = [];
            await interaction.reply({
              content: "🗑️ ล้าง Queue แล้วค่ะ~",
              ephemeral: true,
            });
            await reply.edit({
              embeds: [createEmbed(0)],
              components: [],
            });
            return;
          }
          return;
      }

      await interaction.update({
        embeds: [createEmbed(currentPage)],
        components: createButtons(currentPage),
      });
    });

    collector.on("end", () => {
      reply.edit({ components: [] }).catch(() => {});
    });
  },
};

export default command;
