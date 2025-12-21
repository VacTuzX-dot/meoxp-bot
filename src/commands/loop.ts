import { Message, EmbedBuilder } from "discord.js";
import { ExtendedClient, Command } from "../types";

const loopModes = [
  { emoji: "➡️", text: "ปิด Loop", color: 0x808080 },
  { emoji: "🔂", text: "Loop เพลงเดียว", color: 0x00ff88 },
  { emoji: "🔁", text: "Loop ทั้ง Queue", color: 0xff69b4 },
];

const command: Command = {
  name: "loop",
  aliases: ["l"],
  description: "Toggle loop mode",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const queue = client.queues.get(message.guild!.id);

    if (!queue) {
      message.reply("❌ ไม่มีการเล่นเพลงอยู่ค่ะ~");
      return;
    }

    // Cycle modes: 0 -> 1 -> 2 -> 0
    queue.loopMode = (queue.loopMode + 1) % 3;
    const mode = loopModes[queue.loopMode];

    // Send loop change message then delete after 3 seconds
    const loopMsg = await message.reply(`${mode.emoji} ${mode.text}แล้วค่ะ~`);
    setTimeout(() => {
      loopMsg.delete().catch(() => {});
      message.delete().catch(() => {});
    }, 3000);

    // Update Now Playing message if exists
    if (queue.nowPlaying && queue.nowPlayingMessage) {
      const song = queue.nowPlaying;

      const embed = new EmbedBuilder()
        .setTitle("🎵 กำลังเล่นเพลงค่ะ~")
        .setDescription(`**${song.title}**`)
        .setColor(mode.color)
        .addFields(
          {
            name: "⏱️ ความยาว",
            value: song.durationInfo || "Unknown",
            inline: true,
          },
          {
            name: "🎤 ศิลปิน",
            value: song.uploader || "Unknown",
            inline: true,
          },
          {
            name: "👤 ขอโดย",
            value: song.requester || "Unknown",
            inline: true,
          },
          {
            name: "🔊 คุณภาพเสียง",
            value: "`OPUS` • 128kbps • 48kHz • Stereo",
            inline: false,
          },
          {
            name: "🔄 Loop",
            value: `${mode.emoji} ${mode.text}`,
            inline: true,
          },
          {
            name: "📋 Queue",
            value: `${queue.songs.length} เพลง`,
            inline: true,
          }
        )
        .setFooter({ text: "💕 เพลงเพราะมากเลยค่ะ~" });

      if (song.thumbnail) embed.setThumbnail(song.thumbnail);

      try {
        await queue.nowPlayingMessage.edit({ embeds: [embed] });
      } catch (e) {
        // Ignore edit errors
      }
    }
  },
};

export default command;
