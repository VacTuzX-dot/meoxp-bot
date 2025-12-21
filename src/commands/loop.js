const { EmbedBuilder } = require("discord.js");

module.exports = {
  name: "loop",
  description: "Toggle loop mode",
  async execute(message, args, client) {
    const queue = client.queues?.get(message.guild.id);
    if (!queue) return message.reply("❌ ไม่มีการเล่นเพลงอยู่ค่ะ~");

    // Cycle modes: 0 -> 1 -> 2 -> 0
    queue.loopMode = (queue.loopMode + 1) % 3;

    const loopModes = [
      { emoji: "➡️", text: "ปิด Loop", color: 0x808080 },
      { emoji: "🔂", text: "Loop เพลงเดียว", color: 0x00ff88 },
      { emoji: "🔁", text: "Loop ทั้ง Queue", color: 0xff69b4 },
    ];

    const mode = loopModes[queue.loopMode];

    // Send loop change message then delete after 3 seconds
    const loopMsg = await message.reply(`${mode.emoji} ${mode.text}แล้วค่ะ~`);
    setTimeout(() => {
      loopMsg.delete().catch(() => {});
      message.delete().catch(() => {}); // Also delete the command message
    }, 3000);

    // Update Now Playing message if exists
    if (queue.nowPlaying && queue.nowPlayingMessage) {
      const song = queue.nowPlaying;

      // Format audio quality string
      const codec = song.audioCodec || "Unknown";
      const bitrate = song.audioBitrate
        ? `${Math.round(song.audioBitrate)}kbps`
        : "N/A";
      const sampleRate = song.audioSampleRate
        ? `${song.audioSampleRate / 1000}kHz`
        : "48kHz";
      const channels =
        song.audioChannels === 2
          ? "Stereo"
          : song.audioChannels === 1
          ? "Mono"
          : `${song.audioChannels}ch`;
      const ext = song.audioExt || "webm";
      const audioQuality = `\`${codec.toUpperCase()}\` • ${bitrate} • ${sampleRate} • ${channels} • ${ext}`;

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
          { name: "🔊 คุณภาพเสียง", value: audioQuality, inline: false },
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

      // Edit the existing Now Playing message instead of sending a new one
      try {
        await queue.nowPlayingMessage.edit({ embeds: [embed] });
      } catch (e) {
        // If edit fails, send a new message
        if (queue.textChannel) {
          const npMsg = await queue.textChannel
            .send({ embeds: [embed] })
            .catch(() => null);
          queue.nowPlayingMessage = npMsg;
        }
      }
    }
  },
};
