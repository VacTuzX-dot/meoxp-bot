import discord
import yt_dlp
import asyncio
from asyncio import Semaphore
from collections import OrderedDict
import time
import hashlib

# ============ LOAD BALANCING CONFIG ============
MAX_CONCURRENT_EXTRACTIONS = 5  # เพิ่มจาก 3 เป็น 5
MAX_QUEUE_SIZE = 1000  # รองรับ 1000 เพลง
RATE_LIMIT_DELAY = 0.3  # ลดจาก 0.5 เป็น 0.3 วินาที
REQUEST_TIMEOUT = 20  # ลดจาก 30 เป็น 20 วินาที

extraction_semaphore = Semaphore(MAX_CONCURRENT_EXTRACTIONS)
last_request_time = 0
rate_limit_lock = asyncio.Lock()
active_requests = {}

# ============ SEARCH CACHE ============
# Cache search results เพื่อไม่ต้อง request ซ้ำ
CACHE_MAX_SIZE = 200
CACHE_TTL = 300  # 5 นาที
search_cache = OrderedDict()


def get_cache_key(query):
    """Generate cache key from query"""
    return hashlib.md5(query.encode()).hexdigest()[:16]


def get_cached_search(query):
    """Get cached search result"""
    key = get_cache_key(query)
    if key in search_cache:
        data, timestamp = search_cache[key]
        if time.time() - timestamp < CACHE_TTL:
            # Move to end (LRU)
            search_cache.move_to_end(key)
            return data
        else:
            # Expired, remove
            del search_cache[key]
    return None


def set_cached_search(query, data):
    """Cache search result"""
    key = get_cache_key(query)
    search_cache[key] = (data, time.time())
    # Limit cache size
    while len(search_cache) > CACHE_MAX_SIZE:
        search_cache.popitem(last=False)


async def acquire_rate_limit():
    """Rate limiter"""
    global last_request_time
    async with rate_limit_lock:
        now = time.time()
        elapsed = now - last_request_time
        if elapsed < RATE_LIMIT_DELAY:
            await asyncio.sleep(RATE_LIMIT_DELAY - elapsed)
        last_request_time = time.time()


def get_request_count(guild_id=None):
    if guild_id:
        return active_requests.get(guild_id, 0)
    return sum(active_requests.values())


# ============ YT-DLP CONFIG (OPTIMIZED FOR SPEED) ============
YTDL_FORMAT = (
    'bestaudio[abr>=256]/bestaudio[abr>=192]/bestaudio[abr>=128]/'
    'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best'
)

# Optimized for fast search
FAST_OPTIONS = {
    'format': YTDL_FORMAT,
    'restrictfilenames': True,
    'nocheckcertificate': True,
    'ignoreerrors': True,
    'logtostderr': False,
    'quiet': True,
    'no_warnings': True,
    'default_search': 'ytsearch',
    'source_address': '0.0.0.0',
    'extract_flat': False,
    'skip_download': True,
    'socket_timeout': 8,  # ลดจาก 10
    'retries': 2,  # ลดจาก 3
    'extractor_args': {
        'youtube': {
            'player_client': ['ios', 'web'],
            'skip': ['dash', 'hls'],
        }
    },
}

# For single track (fast)
ytdl_single_options = {
    **FAST_OPTIONS,
    'noplaylist': True,
}

# For playlist (minimal data for speed)
ytdl_playlist_options = {
    'format': YTDL_FORMAT,
    'restrictfilenames': True,
    'nocheckcertificate': True,
    'ignoreerrors': True,
    'logtostderr': False,
    'quiet': True,
    'no_warnings': True,
    'default_search': 'ytsearch',
    'source_address': '0.0.0.0',
    'noplaylist': False,
    'extract_flat': 'in_playlist',  # Fast extraction
    'playlistend': 1000,  # รองรับ 1000 เพลง
    'socket_timeout': 15,
    'retries': 2,
}

ffmpeg_options = {
    'options': '-vn -b:a 192k',
    'before_options': '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5'
}

ytdl_single = yt_dlp.YoutubeDL(ytdl_single_options)
ytdl_playlist = yt_dlp.YoutubeDL(ytdl_playlist_options)


def extract_audio_info(data):
    """Extract audio quality info"""
    abr = data.get('abr')
    acodec = data.get('acodec')
    ext = data.get('ext')
    
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
    """Audio source with load balancing and caching"""
    
    def __init__(self, source, *, data, volume=0.5):
        super().__init__(source, volume)
        self.data = data
        self.title = data.get('title', 'Unknown')
        self.url = data.get('url')
        self.webpage_url = data.get('webpage_url')
        self.duration = data.get('duration')
        self.thumbnail = data.get('thumbnail')
        self.uploader = data.get('uploader')
        
        abr, acodec, ext = extract_audio_info(data)
        self.abr = abr
        self.acodec = acodec
        self.ext = ext

    @classmethod
    async def from_url(cls, url, *, loop=None, guild_id=None):
        """Create audio source from URL"""
        loop = loop or asyncio.get_event_loop()
        
        if guild_id:
            active_requests[guild_id] = active_requests.get(guild_id, 0) + 1
        
        try:
            await acquire_rate_limit()
            
            async with extraction_semaphore:
                data = await asyncio.wait_for(
                    loop.run_in_executor(
                        None, lambda: ytdl_single.extract_info(url, download=False)
                    ),
                    timeout=REQUEST_TIMEOUT
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
        finally:
            if guild_id:
                active_requests[guild_id] = max(0, active_requests.get(guild_id, 1) - 1)
    
    @classmethod
    async def from_data(cls, data, *, loop=None):
        """Create audio source from cached data (fastest)"""
        audio_url = data.get('url') or data.get('audio_url')
        if not audio_url:
            raise Exception("ไม่พบ URL เสียง")
        
        return cls(
            discord.FFmpegPCMAudio(audio_url, **ffmpeg_options),
            data=data
        )
    
    @classmethod
    async def search(cls, query, *, loop=None, guild_id=None):
        """Search with caching (fastest)"""
        loop = loop or asyncio.get_event_loop()
        
        # Check cache first
        cached = get_cached_search(query)
        if cached:
            return cached
        
        if not query.startswith('http'):
            query = f'ytsearch:{query}'
        
        if guild_id:
            active_requests[guild_id] = active_requests.get(guild_id, 0) + 1
        
        try:
            await acquire_rate_limit()
            
            async with extraction_semaphore:
                data = await asyncio.wait_for(
                    loop.run_in_executor(
                        None, lambda: ytdl_single.extract_info(query, download=False)
                    ),
                    timeout=REQUEST_TIMEOUT
                )
            
            if data is None:
                return None
            
            if 'entries' in data:
                data = data['entries'][0] if data['entries'] else None
            
            # Cache result
            if data:
                set_cached_search(query, data)
            
            return data
        finally:
            if guild_id:
                active_requests[guild_id] = max(0, active_requests.get(guild_id, 1) - 1)
    
    @classmethod
    async def extract_playlist(cls, url, *, loop=None, guild_id=None):
        """Extract playlist (up to 1000 songs)"""
        loop = loop or asyncio.get_event_loop()
        
        if guild_id:
            active_requests[guild_id] = active_requests.get(guild_id, 0) + 1
        
        try:
            await acquire_rate_limit()
            
            async with extraction_semaphore:
                data = await asyncio.wait_for(
                    loop.run_in_executor(
                        None, lambda: ytdl_playlist.extract_info(url, download=False)
                    ),
                    timeout=60  # playlist needs more time
                )
            
            if data is None:
                return None, []
            
            if 'entries' not in data:
                return None, [data]
            
            playlist_name = data.get('title', 'Playlist')
            entries = [e for e in data['entries'] if e][:1000]  # Limit 1000
            
            return playlist_name, entries
        finally:
            if guild_id:
                active_requests[guild_id] = max(0, active_requests.get(guild_id, 1) - 1)


def get_load_stats():
    """Get current load statistics"""
    return {
        'active_requests': sum(active_requests.values()),
        'max_concurrent': MAX_CONCURRENT_EXTRACTIONS,
        'cache_size': len(search_cache),
        'max_queue': MAX_QUEUE_SIZE,
    }


def clear_search_cache():
    """Clear search cache"""
    search_cache.clear()
