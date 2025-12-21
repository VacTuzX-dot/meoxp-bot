import {
  Message,
  EmbedBuilder,
  ActivityType,
  PresenceUpdateStatus,
} from "discord.js";
import { LoadType } from "shoukaku";
import { ExtendedClient, Command, Song } from "../types";
import {
  createQueue,
  getPlayer,
  trackToSong,
  formatDuration,
} from "../lib/ShoukakuManager";

// Format audio quality string
function formatAudioQuality(song: Song): string {
  return "`OPUS` • 128kbps • 48kHz • Stereo";
}

// Create Now Playing embed
function createNowPlayingEmbed(song: Song, queue: any): EmbedBuilder {
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
        value: formatAudioQuality(song),
        inline: false,
      },
      { name: "🔄 Loop", value: loopModes[queue?.loopMode || 0], inline: true },
      {
        name: "📋 Queue",
        value: `${queue?.songs?.length || 0} เพลง`,
        inline: true,
      }
    )
    .setFooter({ text: "💕 เพลงเพราะมากเลยค่ะ~" });

  if (song.thumbnail) embed.setThumbnail(song.thumbnail);

  return embed;
}

// Update bot presence
function updateBotPresence(client: ExtendedClient, inVoice: boolean): void {
  client.user?.setPresence({
    status: inVoice
      ? PresenceUpdateStatus.DoNotDisturb
      : PresenceUpdateStatus.Idle,
    activities: [
      {
        name: inVoice ? "🎵 กำลังเล่นเพลง~" : "เปิดใช้เมนูพิมพ์ !!help ค่ะ 😊",
        type: ActivityType.Listening,
      },
    ],
  });
}

// Process queue
async function processQueue(
  guildId: string,
  client: ExtendedClient
): Promise<void> {
  const queue = client.queues.get(guildId);
  if (!queue || !queue.player) return;

  // Handle Loop Logic
  if (queue.nowPlaying) {
    if (queue.loopMode === 1) {
      queue.songs.unshift(queue.nowPlaying);
    } else if (queue.loopMode === 2) {
      queue.songs.push(queue.nowPlaying);
    }
  }

  // Check if empty
  if (queue.songs.length === 0) {
    queue.nowPlaying = null;
    return;
  }

  const song = queue.songs.shift()!;
  queue.nowPlaying = song;

  console.log("[PLAY] Now playing:", song.title);

  try {
    // Get the node
    const node = client.shoukaku.options.nodeResolver(client.shoukaku.nodes);
    if (!node) {
      console.error("[LAVALINK] No available nodes");
      return;
    }

    // Search and play
    const result = await node.rest.resolve(song.url);
    if (
      !result ||
      result.loadType === LoadType.ERROR ||
      result.loadType === LoadType.EMPTY
    ) {
      console.error("[LAVALINK] Failed to load track:", song.url);
      return processQueue(guildId, client);
    }

    const track =
      result.loadType === LoadType.TRACK
        ? result.data
        : (result.data as any)[0];
    if (!track) {
      return processQueue(guildId, client);
    }

    queue.player.playTrack({ track: track.encoded });

    // Send Now Playing message
    if (queue.textChannelId) {
      const channel = await client.channels.fetch(queue.textChannelId);
      if (channel && "send" in channel) {
        // Delete old message
        if (queue.nowPlayingMessage) {
          queue.nowPlayingMessage.delete().catch(() => {});
        }

        const embed = createNowPlayingEmbed(song, queue);
        const npMsg = await (channel as any)
          .send({ embeds: [embed] })
          .catch(() => null);
        queue.nowPlayingMessage = npMsg;
      }
    }
  } catch (error) {
    console.error("Play error:", error);
    setTimeout(() => processQueue(guildId, client), 1000);
  }
}

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

    // Initialize queue if not exists
    if (!client.queues.has(guildId)) {
      client.queues.set(guildId, createQueue());
    }

    const queue = client.queues.get(guildId)!;
    queue.textChannelId = message.channel.id;
    queue.voiceChannelId = voiceChannelId;

    const statusMsg = await message.reply("🔍 กำลังค้นหาเพลงค่ะ...");

    try {
      // Get the node
      const node = client.shoukaku.options.nodeResolver(client.shoukaku.nodes);
      if (!node) {
        await statusMsg.edit("❌ Lavalink ยังไม่พร้อมค่ะ กรุณารอสักครู่~");
        return;
      }

      // Determine if it's a search or direct URL
      const isUrl = query.startsWith("http://") || query.startsWith("https://");
      const searchQuery = isUrl ? query : `ytsearch:${query}`;

      // Search for tracks
      const result = await node.rest.resolve(searchQuery);

      if (!result || result.loadType === LoadType.ERROR) {
        await statusMsg.edit("❌ เกิดข้อผิดพลาดในการค้นหาค่ะ 🥺");
        return;
      }

      if (result.loadType === LoadType.EMPTY) {
        await statusMsg.edit("❌ ไม่พบเพลงค่ะ 🥺");
        return;
      }

      let songsToAdd: Song[] = [];

      if (result.loadType === LoadType.PLAYLIST) {
        // Playlist
        const tracks = (result.data as any).tracks;
        const maxSongs = Math.min(tracks.length, 500);

        for (let i = 0; i < maxSongs; i++) {
          songsToAdd.push(trackToSong(tracks[i], message.author.username));
        }

        let statusText = `📚 เพิ่ม Playlist **${songsToAdd.length}** เพลงแล้วค่ะ~`;
        if (tracks.length > 500) {
          statusText += `\n⚠️ Playlist มี ${tracks.length} เพลง แต่เพิ่มได้สูงสุด 500 เพลงค่ะ`;
        }
        await statusMsg.edit(statusText);
      } else if (result.loadType === LoadType.SEARCH) {
        // Search result - get first
        const track = (result.data as any)[0];
        if (!track) {
          await statusMsg.edit("❌ ไม่พบเพลงค่ะ 🥺");
          return;
        }
        songsToAdd.push(trackToSong(track, message.author.username));
      } else if (result.loadType === LoadType.TRACK) {
        // Single track
        songsToAdd.push(trackToSong(result.data, message.author.username));
      }

      // Add to queue
      queue.songs.push(...songsToAdd);

      // Connect to voice if needed
      if (!queue.player) {
        const player = await getPlayer(client, guildId, voiceChannelId);
        if (!player) {
          await statusMsg.edit("❌ ไม่สามารถเชื่อมต่อห้องเสียงได้ค่ะ 🥺");
          return;
        }

        queue.player = player;
        updateBotPresence(client, true);

        // Player events
        player.on("end", () => {
          processQueue(guildId, client);
        });

        player.on("exception", (error) => {
          console.error("Player error:", error);
          processQueue(guildId, client);
        });

        player.on("stuck", () => {
          console.log("[PLAYER] Track stuck, skipping...");
          processQueue(guildId, client);
        });
      }

      // Start playing if not already
      if (!queue.nowPlaying) {
        await processQueue(guildId, client);
        await statusMsg.delete().catch(() => {});
      } else if (songsToAdd.length === 1) {
        // Single song added - show embed
        const song = songsToAdd[0];
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
            text: `📋 ตำแหน่งใน Queue: #${queue.songs.length} | ขอโดย: ${song.requester}`,
          });

        if (song.thumbnail) embed.setThumbnail(song.thumbnail);
        await statusMsg.edit({ content: "", embeds: [embed] });
      } else {
        // Playlist - delete message after delay
        setTimeout(() => statusMsg.delete().catch(() => {}), 5000);
      }
    } catch (error) {
      console.error(error);
      await statusMsg.edit(`❌ เกิดข้อผิดพลาด: ${(error as Error).message}`);
    }
  },
};

export default command;
