import { Message, EmbedBuilder } from "discord.js";
import { ExtendedClient, Command } from "../types";

const command: Command = {
  name: "queue",
  aliases: ["q"],
  description: "Show the queue",
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

    const loopModes = ["➡️ ปิด", "🔂 เพลงเดียว", "🔁 ทั้ง Queue"];

    let description = "";

    if (queue.nowPlaying) {
      description += `🎵 **กำลังเล่น:** ${queue.nowPlaying.title}\n\n`;
    }

    if (queue.songs.length > 0) {
      description += "**📋 Queue:**\n";
      const songsToShow = queue.songs.slice(0, 10);
      songsToShow.forEach((song, index) => {
        description += `${index + 1}. ${song.title} (${song.durationInfo})\n`;
      });

      if (queue.songs.length > 10) {
        description += `\n...และอีก ${queue.songs.length - 10} เพลง`;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("📋 Queue")
      .setDescription(description)
      .setColor(0xff69b4)
      .setFooter({
        text: `🔄 Loop: ${loopModes[queue.loopMode]} | ${
          queue.songs.length
        } เพลงใน Queue`,
      });

    message.reply({ embeds: [embed] });
  },
};

export default command;
