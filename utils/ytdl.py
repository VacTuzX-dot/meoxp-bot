import discord
import yt_dlp
import asyncio

# yt-dlp optimized settings for high quality audio
# Priority: highest bitrate first, fallback to lower quality
YTDL_FORMAT = (
    'bestaudio[abr>=256]/bestaudio[abr>=192]/bestaudio[abr>=128]/'
    'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best'
)

# Shared options
BASE_OPTIONS = {
    'format': YTDL_FORMAT,
    'restrictfilenames': True,
    'nocheckcertificate': True,
    'ignoreerrors': True,
    'logtostderr': False,
    'quiet': True,
    'no_warnings': True,
    'default_search': 'ytsearch',
    'source_address': '0.0.0.0',
    'extractor_args': {
        'youtube': {
            'player_client': ['ios', 'android', 'web'],
            'skip': ['dash', 'hls'],
        }
    },
    'socket_timeout': 10,
    'retries': 3,
}

# For playlist extraction (fast, minimal data)
ytdl_format_options = {
    **BASE_OPTIONS,
    'noplaylist': False,
    'extract_flat': 'in_playlist',
    'playlistend': 200,
}

# For single track extraction (full data)
ytdl_single_options = {
    **BASE_OPTIONS,
    'noplaylist': True,
}

# FFmpeg options for low latency streaming
ffmpeg_options = {
    'options': '-vn -b:a 192k',
    'before_options': '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5'
}

# Create extractors
ytdl = yt_dlp.YoutubeDL(ytdl_format_options)
ytdl_single = yt_dlp.YoutubeDL(ytdl_single_options)


def extract_audio_info(data):
    """Extract audio quality info from yt-dlp data"""
    abr = data.get('abr')
    acodec = data.get('acodec')
    ext = data.get('ext')
    
    # Try to get from requested_formats or formats
    if not abr or not acodec:
        if 'requested_formats' in data:
            for fmt in data['requested_formats']:
                if fmt.get('acodec') and fmt.get('acodec') != 'none':
                    abr = abr or fmt.get('abr') or fmt.get('tbr')
                    acodec = acodec or fmt.get('acodec')
                    ext = ext or fmt.get('ext')
                    break
        
        if not abr and 'formats' in data and 'format_id' in data:
            for fmt in data['formats']:
                if fmt.get('format_id') == data['format_id']:
                    abr = fmt.get('abr') or fmt.get('tbr')
                    acodec = fmt.get('acodec')
                    ext = fmt.get('ext')
                    break
    
    return abr, acodec, ext


class YTDLSource(discord.PCMVolumeTransformer):
    """Audio source from yt-dlp with volume control"""
    
    def __init__(self, source, *, data, volume=0.5):
        super().__init__(source, volume)
        self.data = data
        self.title = data.get('title', 'Unknown')
        self.url = data.get('url')
        self.webpage_url = data.get('webpage_url')
        self.duration = data.get('duration')
        self.thumbnail = data.get('thumbnail')
        self.uploader = data.get('uploader')
        
        # Audio quality info
        abr, acodec, ext = extract_audio_info(data)
        self.abr = abr
        self.acodec = acodec
        self.ext = ext

    @classmethod
    async def from_url(cls, url, *, loop=None):
        """Create audio source from URL (streaming)"""
        loop = loop or asyncio.get_event_loop()
        data = await loop.run_in_executor(
            None, lambda: ytdl_single.extract_info(url, download=False)
        )
        if data is None:
            raise Exception("ไม่สามารถดึงข้อมูลเพลงได้")
        if 'entries' in data:
            data = data['entries'][0]
        
        audio_url = data.get('url')
        if not audio_url:
            raise Exception("ไม่พบ URL เสียง")
        
        return cls(
            discord.FFmpegPCMAudio(audio_url, **ffmpeg_options),
            data=data
        )
    
    @classmethod
    async def from_data(cls, data, *, loop=None):
        """Create audio source from cached data (faster)"""
        audio_url = data.get('url') or data.get('audio_url')
        if not audio_url:
            raise Exception("ไม่พบ URL เสียง")
        
        return cls(
            discord.FFmpegPCMAudio(audio_url, **ffmpeg_options),
            data=data
        )
    
    @classmethod
    async def search(cls, query, *, loop=None):
        """Search and extract single track info"""
        loop = loop or asyncio.get_event_loop()
        
        # Add search prefix if not URL
        if not query.startswith('http'):
            query = f'ytsearch:{query}'
        
        data = await loop.run_in_executor(
            None, lambda: ytdl_single.extract_info(query, download=False)
        )
        
        if data is None:
            return None
        
        if 'entries' in data:
            data = data['entries'][0] if data['entries'] else None
        
        return data
    
    @classmethod
    async def extract_playlist(cls, url, *, loop=None):
        """Extract playlist info (fast, minimal data)"""
        loop = loop or asyncio.get_event_loop()
        
        data = await loop.run_in_executor(
            None, lambda: ytdl.extract_info(url, download=False)
        )
        
        if data is None:
            return None, []
        
        if 'entries' not in data:
            # Not a playlist, single track
            return None, [data]
        
        playlist_name = data.get('title', 'Playlist')
        entries = [e for e in data['entries'] if e]
        
        return playlist_name, entries
