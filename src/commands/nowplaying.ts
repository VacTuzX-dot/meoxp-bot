import { Message, EmbedBuilder } from "discord.js";
import { ExtendedClient, Command } from "../types";

const command: Command = {
  name: "nowplaying",
  aliases: ["np"],
  description: "Show the currently playing song",
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

    const embed = new EmbedBuilder()
      .setTitle("🎵 กำลังเล่นเพลงค่ะ~")
      .setDescription(`**${song.title}**`)
      .setColor(0x00ff88)
      .addFields(
        {
          name: "⏱️ ความยาว",
          value: song.durationInfo || "Unknown",
          inline: true,
        },
        { name: "🎤 ศิลปิน", value: song.uploader || "Unknown", inline: true },
        { name: "👤 ขอโดย", value: song.requester || "Unknown", inline: true },
        {
          name: "🔊 คุณภาพเสียง",
          value: "`OPUS` • 128kbps • 48kHz • Stereo",
          inline: false,
        },
        { name: "🔄 Loop", value: loopModes[queue.loopMode], inline: true },
        { name: "📋 Queue", value: `${queue.songs.length} เพลง`, inline: true }
      )
      .setFooter({ text: "💕 เพลงเพราะมากเลยค่ะ~" });

    if (song.thumbnail) embed.setThumbnail(song.thumbnail);

    message.reply({ embeds: [embed] });
  },
};

export default command;
