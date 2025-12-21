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

// Max playlist size
const MAX_PLAYLIST_SIZE = 500;

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

// Helper to extract playlist ID
function extractPlaylistId(url) {
  const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// Get playlist info using yt-dlp
async function getPlaylistInfo(url) {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn("yt-dlp", [
      "-j",
      "--flat-playlist",
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
        reject(new Error(stderr || "Failed to get playlist info"));
        return;
      }
      try {
        // Each line is a JSON object for each video
        const lines = stdout
          .trim()
          .split("\n")
          .filter((line) => line);
        const videos = lines.map((line) => {
          const info = JSON.parse(line);
          return {
            title: info.title || "Unknown",
            url: `https://www.youtube.com/watch?v=${info.id}`,
            duration: info.duration,
            thumbnail: info.thumbnails?.[0]?.url || null,
            uploader: info.uploader || info.channel || "Unknown",
          };
        });
        resolve(videos);
      } catch (e) {
        reject(new Error("Failed to parse playlist info"));
      }
    });
  });
}

// Get video info using yt-dlp with audio format details
async function getVideoInfo(url) {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn("yt-dlp", [
      "-j", // JSON output
      "-f",
      "bestaudio[ext=webm]/bestaudio/best",
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

        // Extract audio format details
        const audioFormat =
          info.formats?.find(
            (f) =>
              f.format_id === info.format_id ||
              (f.acodec && f.acodec !== "none")
          ) || info;

        resolve({
          title: info.title,
          url: info.webpage_url || url,
          duration: info.duration,
          thumbnail: info.thumbnail,
          uploader: info.uploader || info.channel || "Unknown",
          viewCount: info.view_count,
          // Audio quality details
          audioCodec: info.acodec || audioFormat.acodec || "Unknown",
          audioBitrate: info.abr || audioFormat.abr || info.tbr || "Unknown",
          audioSampleRate: info.asr || audioFormat.asr || 48000,
          audioChannels: info.audio_channels || audioFormat.audio_channels || 2,
          audioExt: info.audio_ext || audioFormat.ext || info.ext || "Unknown",
          formatNote: info.format_note || audioFormat.format_note || "",
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

  // Pipe through ffmpeg to convert to Ogg/Opus format (Discord native)
  const ffmpeg = spawn("ffmpeg", [
    "-i",
    "pipe:0", // Input from stdin (yt-dlp output)
    "-analyzeduration",
    "0",
    "-loglevel",
    "0",
    "-acodec",
    "libopus", // Use Opus codec
    "-f",
    "ogg", // Output format: Ogg container
    "-ar",
    "48000", // Sample rate: 48kHz (Discord requirement)
    "-ac",
    "2", // Stereo
    "-b:a",
    "128k", // Audio bitrate
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

// Helper to format audio quality string
function formatAudioQuality(song) {
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

  return `\`${codec.toUpperCase()}\` • ${bitrate} • ${sampleRate} • ${channels} • ${ext}`;
}

// Create Now Playing embed
function createNowPlayingEmbed(song, queue) {
  const audioQuality = formatAudioQuality(song);
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
      { name: "🔊 คุณภาพเสียง", value: audioQuality, inline: false },
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
        nowPlayingMessage: null, // Track the Now Playing message for deletion
      });
    }

    const queue = client.queues.get(message.guild.id);
    const statusMsg = await message.reply("🔍 กำลังค้นหาเพลงค่ะ...");

    try {
      let songsToAdd = [];

      // Check if it's a playlist
      const playlistId = extractPlaylistId(query);

      if (playlistId) {
        console.log("Detected playlist:", playlistId);
        await statusMsg.edit(
          "📚 กำลังโหลด Playlist ค่ะ... (อาจใช้เวลาสักครู่)"
        );

        try {
          const playlistVideos = await getPlaylistInfo(query);

          // Check if playlist exceeds limit
          if (playlistVideos.length > MAX_PLAYLIST_SIZE) {
            console.warn(
              `[PLAYLIST] Playlist has ${playlistVideos.length} videos, limiting to ${MAX_PLAYLIST_SIZE}`
            );
          }

          // Take only up to MAX_PLAYLIST_SIZE videos
          const videosToAdd = playlistVideos.slice(0, MAX_PLAYLIST_SIZE);

          for (const video of videosToAdd) {
            songsToAdd.push({
              title: video.title,
              url: video.url,
              duration: video.duration,
              durationInfo: formatDuration(video.duration),
              thumbnail: video.thumbnail,
              requester: message.author.username,
              uploader: video.uploader,
              // Audio quality will be fetched when playing
              audioCodec: "Unknown",
              audioBitrate: "Unknown",
              audioSampleRate: 48000,
              audioChannels: 2,
              audioExt: "webm",
            });
          }

          const addedCount = songsToAdd.length;
          const totalCount = playlistVideos.length;
          let statusText = `📚 เพิ่ม Playlist **${addedCount}** เพลงแล้วค่ะ~`;
          if (totalCount > MAX_PLAYLIST_SIZE) {
            statusText += `\n⚠️ Playlist มี ${totalCount} เพลง แต่เพิ่มได้สูงสุด ${MAX_PLAYLIST_SIZE} เพลงค่ะ`;
          }

          await statusMsg.edit(statusText);
        } catch (err) {
          console.error("Playlist failed:", err.message);
          return statusMsg.edit("❌ ไม่สามารถโหลด Playlist ได้ค่ะ 🥺");
        }
      } else {
        // Single video or search
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

        songsToAdd.push({
          title: videoInfo.title,
          url: videoUrl,
          duration: videoInfo.duration,
          durationInfo: formatDuration(videoInfo.duration),
          thumbnail: videoInfo.thumbnail,
          requester: message.author.username,
          uploader: videoInfo.uploader,
          // Audio quality
          audioCodec: videoInfo.audioCodec,
          audioBitrate: videoInfo.audioBitrate,
          audioSampleRate: videoInfo.audioSampleRate,
          audioChannels: videoInfo.audioChannels,
          audioExt: videoInfo.audioExt,
        });
      }

      // Add all songs to queue
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
          processQueue(message.guild.id, client);
        });
      }

      if (!queue.nowPlaying) {
        processQueue(message.guild.id, client, message.channel);
        // For playlists, statusMsg already shows playlist info, delete after 5 sec
        if (playlistId) {
          setTimeout(() => statusMsg.delete().catch(() => {}), 5000);
        } else {
          await statusMsg.delete().catch(() => {});
        }
      } else if (!playlistId && songsToAdd.length === 1) {
        // Single song added to queue - show queue embed
        const song = songsToAdd[0];
        const audioQuality = formatAudioQuality(song);

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
            },
            { name: "🔊 คุณภาพเสียง", value: audioQuality, inline: false }
          )
          .setFooter({
            text: `📋 ตำแหน่งใน Queue: #${queue.songs.length} | ขอโดย: ${song.requester}`,
          });

        if (song.thumbnail) embed.setThumbnail(song.thumbnail);
        await statusMsg.edit({ content: "", embeds: [embed] });
      } else {
        // Playlist added to queue - statusMsg already shows info, delete after 5 sec
        setTimeout(() => statusMsg.delete().catch(() => {}), 5000);
      }
    } catch (error) {
      console.error(error);
      await statusMsg.edit(`❌ เกิดข้อผิดพลาด: ${error.message}`);
    }
  },
};

async function processQueue(guildId, client, channel = null) {
  const queue = client.queues.get(guildId);
  if (!queue) return;

  // Store channel reference if provided
  if (channel) queue.textChannel = channel;

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
      inputType: StreamType.OggOpus,
      inlineVolume: true,
    });

    queue.player.play(resource);

    // Send Now Playing message
    if (queue.textChannel) {
      // Delete old Now Playing message if exists
      if (queue.nowPlayingMessage) {
        queue.nowPlayingMessage.delete().catch(() => {});
      }

      const embed = createNowPlayingEmbed(song, queue);
      const npMsg = await queue.textChannel
        .send({ embeds: [embed] })
        .catch(() => null);
      queue.nowPlayingMessage = npMsg; // Store reference for future deletion
    }
  } catch (error) {
    console.error("Play error:", error.message);
    setTimeout(() => processQueue(guildId, client), 1000);
  }
}
