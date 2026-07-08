import { Message, EmbedBuilder } from "discord.js";
import { ExtendedClient, Command } from "../types";
import { trackToSong } from "../lib/MoodenglinkManager";

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
    const player = client.manager.get(message.guild!.id);

    if (!player) {
      message.reply("❌ ไม่มีการเล่นเพลงอยู่นะคะนายท่าน~");
      return;
    }

    player.setRepeatMode((player.repeatMode + 1) % 3);
    const mode = loopModes[player.repeatMode];

    const loopMsg = await message.reply(
      `${mode.emoji} ${mode.text}แล้วค่ะนายท่าน~ ✨`
    );
    setTimeout(() => {
      loopMsg.delete().catch(() => {});
      message.delete().catch(() => {});
    }, 3000);

    const npMessage = player.get<Message>("nowPlayingMessage");
    if (player.queue.current && npMessage) {
      const song = trackToSong(player.queue.current);

      const embed = new EmbedBuilder()
        .setTitle("🎵 กำลังเล่นเพลงค่ะนายท่าน~")
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
          { name: "🔊 คุณภาพ", value: "`OPUS` • 128kbps", inline: false },
          {
            name: "🔄 Loop",
            value: `${mode.emoji} ${mode.text}`,
            inline: true,
          },
          {
            name: "📋 Queue",
            value: `${player.queue.length} เพลง`,
            inline: true,
          }
        )
        .setFooter({ text: "💕 เพลงเพราะมากเลยค่ะนายท่าน~" });

      if (song.thumbnail) embed.setThumbnail(song.thumbnail);

      try {
        await npMessage.edit({ embeds: [embed] });
      } catch (e) {}
    }
  },
};

export default command;
