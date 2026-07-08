import { Message, EmbedBuilder } from "discord.js";
import { ExtendedClient, Command } from "../types";
import {
  getPlayer,
  trackToSong,
  isLavalinkReady,
} from "../lib/MoodenglinkManager";
import { broadcastGuildUpdate } from "../api";

const command: Command = {
  name: "play",
  aliases: ["p"],
  description: "Play music from YouTube",
  async execute(
    message: Message,
    args: string[],
    client: ExtendedClient
  ): Promise<void> {
    const member = message.member;
    if (!member?.voice.channel) {
      message.reply("❌ คุณต้องเข้าห้องเสียงก่อนนะคะ~ 🎤");
      return;
    }

    const query = args.join(" ");
    if (!query) {
      message.reply("❌ กรุณาระบุชื่อเพลงหรือลิ้งค์ด้วยค่ะ~");
      return;
    }

    const voiceChannelId = member.voice.channel.id;
    const guildId = message.guild!.id;

    const statusMsg = await message.reply("🔍 กำลังค้นหาเพลงค่ะ...");

    try {
      if (!isLavalinkReady(client)) {
        await statusMsg.edit(
          "❌ Lavalink ยังไม่พร้อมค่ะ กำลัง reconnect... กรุณารอสักครู่~"
        );
        return;
      }

      const result = await client.manager.search(
        query,
        message.author.username
      );

      if (result.loadType === "error") {
        await statusMsg.edit("❌ เกิดข้อผิดพลาดในการค้นหาค่ะ 🥺");
        return;
      }

      if (result.loadType === "empty" || result.tracks.length === 0) {
        await statusMsg.edit("❌ ไม่พบเพลงค่ะ 🥺");
        return;
      }

      const player = await getPlayer(
        client,
        guildId,
        voiceChannelId,
        message.channel.id
      );
      if (!player) {
        await statusMsg.edit("❌ ไม่สามารถเชื่อมต่อห้องเสียงได้ค่ะ 🥺");
        return;
      }

      let addedCount = 0;
      if (result.loadType === "playlist") {
        const tracks = result.tracks.slice(0, 500);
        player.queue.add(tracks);
        addedCount = tracks.length;

        let statusText = `📚 เพิ่ม Playlist **${addedCount}** เพลงแล้วค่ะ~`;
        if (result.tracks.length > 500) {
          statusText += `\n⚠️ Playlist มี ${result.tracks.length} เพลง แต่เพิ่มได้สูงสุด 500 เพลงค่ะ`;
        }
        await statusMsg.edit(statusText);
      } else {
        player.queue.add(result.tracks[0]);
        addedCount = 1;
      }

      broadcastGuildUpdate(client, guildId);

      if (!player.playing && !player.paused) {
        await player.play();
        await statusMsg.delete().catch(() => {});
      } else if (addedCount === 1) {
        const song = trackToSong(result.tracks[0]);
        const embed = new EmbedBuilder()
          .setTitle("📥 เพิ่มเข้า Queue แล้วค่ะ~")
          .setDescription(`**${song.title}**`)
          .setColor(0xff69b4)
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
            }
          )
          .setFooter({
            text: `📋 ตำแหน่งใน Queue: #${player.queue.length} | ขอโดย: ${song.requester}`,
          });

        if (song.thumbnail) embed.setThumbnail(song.thumbnail);
        await statusMsg.edit({ content: "", embeds: [embed] });
      } else {
        setTimeout(() => statusMsg.delete().catch(() => {}), 5000);
      }
    } catch (error) {
      console.error(error);
      await statusMsg.edit(`❌ เกิดข้อผิดพลาด: ${(error as Error).message}`);
    }
  },
};

export default command;
