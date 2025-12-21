const { EmbedBuilder } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
} = require("@discordjs/voice");
const { spawn } = require("child_process");
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

// Get video info using yt-dlp
async function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn("yt-dlp", [
      "-j", // JSON output
      "--no-playlist",
      "--no-warnings",
      url,
    ]);

    let stdout = "";
    let stderr = "";

    ytdlp.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    ytdlp.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ytdlp.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || "Failed to get video info"));
        return;
      }
      try {
        const info = JSON.parse(stdout);
        resolve({
          title: info.title,
          url: info.webpage_url || url,
          duration: info.duration,
          thumbnail: info.thumbnail,
        });
      } catch (e) {
        reject(new Error("Failed to parse video info"));
      }
    });
  });
}

// Create audio stream using yt-dlp piped through ffmpeg
function createYtDlpStream(url) {
  const ytdlp = spawn("yt-dlp", [
    "-f",
    "bestaudio[ext=webm]/bestaudio/best",
    "-o",
    "-", // Output to stdout
    "--no-playlist",
    "--no-warnings",
    "--quiet",
    url,
  ]);

  // Pipe through ffmpeg to convert to proper audio format
  const ffmpeg = spawn("ffmpeg", [
    "-i",
    "pipe:0", // Input from stdin (yt-dlp output)
    "-analyzeduration",
    "0",
    "-loglevel",
    "0",
    "-f",
    "s16le", // Output format: signed 16-bit little-endian
    "-ar",
    "48000", // Sample rate: 48kHz (Discord requirement)
    "-ac",
    "2", // Stereo
    "pipe:1", // Output to stdout
  ]);

  // Pipe yt-dlp stdout to ffmpeg stdin
  ytdlp.stdout.pipe(ffmpeg.stdin);

  ytdlp.stderr.on("data", (data) => {
    console.error("[yt-dlp]", data.toString());
  });

  ffmpeg.stderr.on("data", (data) => {
    // ffmpeg logs to stderr, only show if debugging
    // console.error("[ffmpeg]", data.toString());
  });

  ytdlp.on("close", (code) => {
    if (code !== 0) {
      console.error("[yt-dlp] exited with code", code);
    }
  });

  return ffmpeg.stdout;
}

// Helper to format duration
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "Unknown";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
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
      let videoUrl;
      let videoInfo;

      // Check if it's a YouTube URL
      const videoId = extractVideoId(query);

      if (videoId) {
        videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
        console.log("Detected YouTube URL:", videoUrl);
      } else {
        // Search for video using youtube-sr
        console.log("Searching for:", query);
        try {
          const searchResults = await YouTube.searchOne(query);
          if (!searchResults) {
            return statusMsg.edit("❌ ไม่พบเพลงค่ะ 🥺");
          }
          videoUrl = searchResults.url;
          console.log("Search result:", searchResults.title, videoUrl);
        } catch (err) {
          console.error("Search failed:", err.message);
          return statusMsg.edit("❌ ไม่สามารถค้นหาเพลงได้ค่ะ 🥺");
        }
      }

      // Get video info using yt-dlp
      try {
        videoInfo = await getVideoInfo(videoUrl);
        console.log("Video info:", videoInfo.title);
      } catch (err) {
        console.error("Failed to get video info:", err.message);
        return statusMsg.edit("❌ ไม่สามารถดึงข้อมูลวิดีโอได้ค่ะ 🥺");
      }

      const song = {
        title: videoInfo.title,
        url: videoUrl,
        durationInfo: formatDuration(videoInfo.duration),
        thumbnail: videoInfo.thumbnail,
        requester: message.author.username,
      };

      // Add to queue
      queue.songs.push(song);

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
          processQueue(message.guild.id, client);
        });
      }

      if (!queue.nowPlaying) {
        processQueue(message.guild.id, client);
        await statusMsg.delete().catch(() => {});
      } else {
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

  const song = queue.songs.shift();
  queue.nowPlaying = song;

  console.log("[PLAY] Now playing:", song.title);

  try {
    if (!song.url) {
      console.error("Invalid song URL:", song);
      return processQueue(guildId, client);
    }

    // Create audio stream using yt-dlp
    const stream = createYtDlpStream(song.url);

    const resource = createAudioResource(stream, {
      inputType: StreamType.Raw,
      inlineVolume: true,
    });

    queue.player.play(resource);
  } catch (error) {
    console.error("Play error:", error.message);
    setTimeout(() => processQueue(guildId, client), 1000);
  }
}
