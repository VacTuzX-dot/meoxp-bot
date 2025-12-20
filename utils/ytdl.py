import discord
import yt_dlp
import asyncio

# Setup สำหรับ yt-dlp (โหลดเพลง) - Optimized for speed + Playlist support
# Prefer high bitrate first: 320kbps > 256kbps > 192kbps > 128kbps > any
HIGH_QUALITY_FORMAT = (
    'bestaudio[abr>=256]/bestaudio[abr>=192]/bestaudio[abr>=128]/'
    'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best'
)

ytdl_format_options = {
    'format': HIGH_QUALITY_FORMAT,
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
    'format': HIGH_QUALITY_FORMAT,
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


def extract_audio_info(data):
    """ดึงข้อมูล audio quality จาก data"""
    abr = data.get('abr')
    acodec = data.get('acodec')
    ext = data.get('ext')
    
    # ถ้าไม่มี abr/acodec ให้ลองดึงจาก requested_formats หรือ format
    if not abr or not acodec:
        # ลองจาก requested_formats (สำหรับ combined formats)
        if 'requested_formats' in data:
            for fmt in data['requested_formats']:
                if fmt.get('acodec') and fmt.get('acodec') != 'none':
                    abr = abr or fmt.get('abr')
                    acodec = acodec or fmt.get('acodec')
                    ext = ext or fmt.get('ext')
                    break
        
        # ลองจาก formats (เลือกอันที่ match กับ format_id)
        if not abr and 'formats' in data and 'format_id' in data:
            for fmt in data['formats']:
                if fmt.get('format_id') == data['format_id']:
                    abr = fmt.get('abr') or fmt.get('tbr')
                    acodec = fmt.get('acodec')
                    ext = fmt.get('ext')
                    break
    
    return abr, acodec, ext


class YTDLSource(discord.PCMVolumeTransformer):
    def __init__(self, source, *, data, volume=0.5):
        super().__init__(source, volume)
        self.data = data
        self.title = data.get('title')
        self.url = data.get('url')
        self.duration = data.get('duration')
        
        # ดึง audio info
        abr, acodec, ext = extract_audio_info(data)
        self.abr = abr or data.get('abr')
        self.acodec = acodec or data.get('acodec')
        self.ext = ext or data.get('ext')

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

