import discord
import yt_dlp
import asyncio

# Setup สำหรับ yt-dlp (โหลดเพลง) - Optimized for speed + Playlist support
ytdl_format_options = {
    'format': 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
    'restrictfilenames': True,
    'noplaylist': False,  # อนุญาต playlist
    'nocheckcertificate': True,
    'ignoreerrors': True,  # ข้ามเพลงที่มีปัญหาใน playlist
    'logtostderr': False,
    'quiet': True,
    'no_warnings': True,
    'default_search': 'ytsearch',
    'source_address': '0.0.0.0',
    'extract_flat': 'in_playlist',  # ดึงข้อมูล playlist เร็วขึ้น
    'extractor_args': {'youtube': {'player_client': ['ios', 'android', 'web']}},
}

# สำหรับดึงเพลงเดี่ยว (ไม่ใช้ extract_flat)
ytdl_single_options = {
    'format': 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best',
    'restrictfilenames': True,
    'noplaylist': True,
    'nocheckcertificate': True,
    'ignoreerrors': True,
    'logtostderr': False,
    'quiet': True,
    'no_warnings': True,
    'default_search': 'ytsearch',
    'source_address': '0.0.0.0',
    'extractor_args': {'youtube': {'player_client': ['ios', 'android', 'web']}},
}

ffmpeg_options = {
    'options': '-vn',
    'before_options': '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5'
}

ytdl = yt_dlp.YoutubeDL(ytdl_format_options)
ytdl_single = yt_dlp.YoutubeDL(ytdl_single_options)


class YTDLSource(discord.PCMVolumeTransformer):
    def __init__(self, source, *, data, volume=0.5):
        super().__init__(source, volume)
        self.data = data
        self.title = data.get('title')
        self.url = data.get('url')
        self.duration = data.get('duration')
        self.abr = data.get('abr')  # audio bitrate
        self.acodec = data.get('acodec')  # audio codec
        self.ext = data.get('ext')  # extension

    @classmethod
    async def from_url(cls, url, *, loop=None):
        """สร้าง audio source จาก URL (ใช้ streaming)"""
        loop = loop or asyncio.get_event_loop()
        data = await loop.run_in_executor(None, lambda: ytdl_single.extract_info(url, download=False))
        if 'entries' in data:
            data = data['entries'][0]
        audio_url = data['url']
        return cls(discord.FFmpegPCMAudio(audio_url, **ffmpeg_options), data=data)
    
    @classmethod
    async def from_data(cls, data, *, loop=None):
        """สร้าง audio source จาก cached data (เร็วกว่า)"""
        audio_url = data['url']
        return cls(discord.FFmpegPCMAudio(audio_url, **ffmpeg_options), data=data)
