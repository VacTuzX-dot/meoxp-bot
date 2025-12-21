const { EmbedBuilder } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
} = require("@discordjs/voice");
const ytdl = require("@distube/ytdl-core");
const YouTube = require("youtube-sr").default;

// Helper to extract video ID from various YouTube URL formats
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Helper to format duration
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "Unknown";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

module.exports = {
  name: "play",
  aliases: ["p"],
  description: "Play music from YouTube",
  async execute(message, args, client) {
    if (!message.member.voice.channel) {
      return message.reply("❌ คุณต้องเข้าห้องเสียงก่อนนะคะ~ 🎤");
    }

    const query = args.join(" ");
    if (!query) {
      return message.reply("❌ กรุณาระบุชื่อเพลงหรือลิ้งค์ด้วยค่ะ~");
    }

    const channel = message.member.voice.channel;

    // Initialize queue structure if not exists
    if (!client.queues) client.queues = new Map();

    if (!client.queues.has(message.guild.id)) {
      client.queues.set(message.guild.id, {
        songs: [],
        connection: null,
        player: null,
        loopMode: 0, // 0: Off, 1: Single, 2: Queue
        nowPlaying: null,
      });
    }

    const queue = client.queues.get(message.guild.id);
    const statusMsg = await message.reply("🔍 กำลังค้นหาเพลงค่ะ...");

    try {
      let songsToAdd = [];

      // Check if it's a YouTube URL
      const videoId = extractVideoId(query);

      if (videoId) {
        console.log("Detected YouTube URL, video ID:", videoId);
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        try {
          const info = await ytdl.getInfo(videoUrl);
          const videoDetails = info.videoDetails;

          songsToAdd.push({
            title: videoDetails.title,
            url: videoUrl,
            durationInfo: formatDuration(parseInt(videoDetails.lengthSeconds)),
            thumbnail: videoDetails.thumbnails?.[0]?.url || null,
            requester: message.author.username,
          });

          console.log("Video info:", videoDetails.title, videoUrl);
        } catch (err) {
          console.error("Failed to get video info:", err.message);
          return statusMsg.edit(
            "❌ ไม่สามารถดึงข้อมูลวิดีโอได้ค่ะ อาจจะถูกบล็อกหรือเป็นวิดีโอส่วนตัว 🥺"
          );
        }
      } else {
        // Search for video using youtube-sr
        console.log("Searching for:", query);
        try {
          const searchResults = await YouTube.searchOne(query);
          if (!searchResults) {
            return statusMsg.edit("❌ ไม่พบเพลงค่ะ 🥺");
          }

          const videoUrl = searchResults.url;
          console.log("Search result:", searchResults.title, videoUrl);

          // Get full video info
          const info = await ytdl.getInfo(videoUrl);
          const videoDetails = info.videoDetails;

          songsToAdd.push({
            title: videoDetails.title,
            url: videoUrl,
            durationInfo: formatDuration(parseInt(videoDetails.lengthSeconds)),
            thumbnail: videoDetails.thumbnails?.[0]?.url || null,
            requester: message.author.username,
          });
        } catch (err) {
          console.error("Search failed:", err.message);
          return statusMsg.edit("❌ ไม่สามารถค้นหาเพลงได้ค่ะ 🥺");
        }
      }

      // Add to queue
      queue.songs.push(...songsToAdd);

      // Connect to voice if needed
      if (
        !queue.connection ||
        queue.connection.state.status === VoiceConnectionStatus.Destroyed
      ) {
        queue.connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

        queue.player = createAudioPlayer();
        queue.connection.subscribe(queue.player);

        // Player events
        queue.player.on(AudioPlayerStatus.Idle, () => {
          processQueue(message.guild.id, client);
        });

        queue.player.on("error", (error) => {
          console.error(`Player error: ${error.message}`);
          // Skip to next
          processQueue(message.guild.id, client);
        });
      }

      if (!queue.nowPlaying) {
        processQueue(message.guild.id, client);
        await statusMsg.delete().catch(() => {}); // Delete waiting msg if playing immediately
      } else {
        // Just added to queue
        const song = songsToAdd[0];
        const embed = new EmbedBuilder()
          .setTitle("📥 เพิ่มเข้า Queue แล้วค่ะ~")
          .setDescription(`**${song.title}**`)
          .setColor(0xff69b4)
          .addFields({
            name: "⏱️ ความยาว",
            value: song.durationInfo || "Unknown",
          })
          .setFooter({
            text: `ตำแหน่ง #${queue.songs.length} | ขอโดย: ${song.requester}`,
          });

        if (song.thumbnail) embed.setThumbnail(song.thumbnail);
        await statusMsg.edit({ content: "", embeds: [embed] });
      }
    } catch (error) {
      console.error(error);
      await statusMsg.edit(`❌ เกิดข้อผิดพลาด: ${error.message}`);
    }
  },
};

async function processQueue(guildId, client) {
  const queue = client.queues.get(guildId);
  if (!queue) return;

  // Handle Loop Logic
  if (queue.nowPlaying) {
    if (queue.loopMode === 1) {
      // Loop One
      queue.songs.unshift(queue.nowPlaying);
    } else if (queue.loopMode === 2) {
      // Loop Queue
      queue.songs.push(queue.nowPlaying);
    }
  }

  // Check if empty
  if (queue.songs.length === 0) {
    queue.nowPlaying = null;
    return;
  }

  const song = queue.songs.shift();
  queue.nowPlaying = song;

  console.log("[PLAY] Now playing:", song.title);

  try {
    // Validate URL before streaming
    if (!song.url || typeof song.url !== "string") {
      console.error("Invalid song URL:", song);
      return processQueue(guildId, client); // Skip to next
    }

    // Use ytdl-core to stream audio
    const stream = ytdl(song.url, {
      filter: "audioonly",
      quality: "highestaudio",
      highWaterMark: 1 << 25, // 32MB buffer for stability
    });

    const resource = createAudioResource(stream, {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });

    queue.player.play(resource);
  } catch (error) {
    console.error("Play error:", error.message);
    // Wait a bit before trying next to avoid spam
    setTimeout(() => processQueue(guildId, client), 1000);
  }
}
