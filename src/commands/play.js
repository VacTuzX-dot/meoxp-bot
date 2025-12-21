const { EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const play = require('play-dl');

// Simple in-memory queue for now (global state like python version)
// In a real app, this should be in a separate Manager class.
// We will store queues on the client object for simplicity in this migration.

module.exports = {
    name: 'play',
    aliases: ['p'],
    description: 'Play music from YouTube',
    async execute(message, args, client) {
        if (!message.member.voice.channel) {
            return message.reply('❌ คุณต้องเข้าห้องเสียงก่อนนะคะ~ 🎤');
        }

        const query = args.join(' ');
        if (!query) {
            return message.reply('❌ กรุณาระบุชื่อเพลงหรือลิ้งค์ด้วยค่ะ~');
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
                nowPlaying: null
            });
        }

        const queue = client.queues.get(message.guild.id);
        const statusMsg = await message.reply('🔍 กำลังค้นหาเพลงค่ะ...');

        try {
            // Check for playlist
            let isPlaylist = query.includes('playlist') && query.includes('list=');
            let songsToAdd = [];

            if (isPlaylist) {
                try {
                    const playlist = await play.playlist_info(query, { incomplete: true });
                    const videos = await playlist.all_videos();
                    
                    videos.forEach(video => {
                         songsToAdd.push({
                            title: video.title,
                            url: video.url,
                            durationInfo: video.durationRaw,
                            thumbnail: video.thumbnails[0]?.url,
                            requester: message.author.username
                        });
                    });
                    
                    await statusMsg.edit(`📚 เพิ่ม Playlist **${playlist.title}** (${songsToAdd.length} เพลง) แล้วค่ะ~`);
                } catch (e) {
                    // Fallback to search if playlist fails
                    isPlaylist = false;
                }
            }

            if (!isPlaylist) {
                let video;
                if (play.yt_validate(query) === 'video') {
                     const info = await play.video_info(query);
                     video = info.video_details;
                } else {
                     const results = await play.search(query, { limit: 1 });
                     if (results.length === 0) {
                         return statusMsg.edit('❌ ไม่พบเพลงค่ะ 🥺');
                     }
                     video = results[0];
                }

                songsToAdd.push({
                    title: video.title,
                    url: video.url,
                    durationInfo: video.durationRaw,
                    thumbnail: video.thumbnails ? video.thumbnails[0]?.url : null,
                    requester: message.author.username
                });
            }

            // Add to queue
            queue.songs.push(...songsToAdd);

            // Connect to voice if needed
            if (!queue.connection || queue.connection.state.status === VoiceConnectionStatus.Destroyed) {
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

                queue.player.on('error', error => {
                    console.error(`Error: ${error.message} with resource`);
                    // Skip to next
                    processQueue(message.guild.id, client);
                });
            }

            if (!queue.nowPlaying) {
                processQueue(message.guild.id, client);
                if (!isPlaylist) {
                    await statusMsg.delete().catch(() => {}); // Delete waiting msg if playing immediately
                }
            } else if (!isPlaylist) {
                // Just added to queue
                const song = songsToAdd[0];
                const embed = new EmbedBuilder()
                    .setTitle('📥 เพิ่มเข้า Queue แล้วค่ะ~')
                    .setDescription(`**${song.title}**`)
                    .setColor(0xFF69B4)
                    .addFields({ name: '⏱️ ความยาว', value: song.durationInfo || 'Unknown' })
                    .setFooter({ text: `ตำแหน่ง #${queue.songs.length} | ขอโดย: ${song.requester}` });
                
                if (song.thumbnail) embed.setThumbnail(song.thumbnail);
                await statusMsg.edit({ content: '', embeds: [embed] });
            }

        } catch (error) {
            console.error(error);
            await statusMsg.edit(`❌ เกิดข้อผิดพลาด: ${error.message}`);
        }
    }
};

async function processQueue(guildId, client) {
    const queue = client.queues.get(guildId);
    if (!queue) return;

    // Handle Loop Logic
    if (queue.nowPlaying) {
        if (queue.loopMode === 1) { // Loop One
            queue.songs.unshift(queue.nowPlaying);
        } else if (queue.loopMode === 2) { // Loop Queue
            queue.songs.push(queue.nowPlaying);
        }
    }
    
    // Check if empty
    if (queue.songs.length === 0) {
        queue.nowPlaying = null;
        // Optionally start a timeout to leave?
        // simple text:
        // const channel = client.channels.cache.get(...) // Need text channel context, complex without passing it.
        return;
    }

    const song = queue.songs.shift();
    queue.nowPlaying = song;

    try {
        const stream = await play.stream(song.url);
        const resource = createAudioResource(stream.stream, {
            inputType: stream.type
        });

        queue.player.play(resource);

        // Ideally we want to send "Now Playing" message, but we need the text channel.
        // We can store the last text channel in the queue object or pass it.
        // For migration simplicity, we skip auto "Now Playing" message on loop/auto-play
        // UNLESS we store the Play command's channel. 
        // Let's improve this later or add a simple channel store.
        
    } catch (error) {
        console.error('Play error:', error);
        processQueue(guildId, client); // Try next
    }
}
