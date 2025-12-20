import discord
import yt_dlp
import asyncio
from asyncio import Semaphore
from collections import OrderedDict
import time
import hashlib

# ============ LOAD BALANCING CONFIG ============
MAX_CONCURRENT_EXTRACTIONS = 5
MAX_QUEUE_SIZE = 1000
RATE_LIMIT_DELAY = 0.3
REQUEST_TIMEOUT = 20

extraction_semaphore = Semaphore(MAX_CONCURRENT_EXTRACTIONS)
last_request_time = 0
rate_limit_lock = asyncio.Lock()
active_requests = {}

# ============ SEARCH CACHE ============
CACHE_MAX_SIZE = 200
CACHE_TTL = 300
search_cache = OrderedDict()


def get_cache_key(query):
    return hashlib.md5(query.encode()).hexdigest()[:16]


def get_cached_search(query):
    key = get_cache_key(query)
    if key in search_cache:
        data, timestamp = search_cache[key]
        if time.time() - timestamp < CACHE_TTL:
            search_cache.move_to_end(key)
            return data
        else:
            del search_cache[key]
    return None


def set_cached_search(query, data):
    key = get_cache_key(query)
    search_cache[key] = (data, time.time())
    while len(search_cache) > CACHE_MAX_SIZE:
        search_cache.popitem(last=False)


async def acquire_rate_limit():
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


# ============ YT-DLP CONFIG (FIXED FOR YOUTUBE) ============
# ใช้ format ที่ง่ายกว่า เพื่อให้ทำงานได้กับ YouTube
YTDL_FORMAT = 'bestaudio/best'

# Options ที่ทำงานได้กับ YouTube ล่าสุด
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
    'socket_timeout': 15,
    'retries': 3,
    # ไม่ใช้ extractor_args เพื่อให้ yt-dlp เลือก client เอง
}

ytdl_single_options = {
    **BASE_OPTIONS,
    'noplaylist': True,
}

ytdl_playlist_options = {
    **BASE_OPTIONS,
    'noplaylist': False,
    'extract_flat': 'in_playlist',
    'playlistend': 1000,
}

ffmpeg_options = {
    'options': '-vn',
    'before_options': '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5'
}

ytdl_single = yt_dlp.YoutubeDL(ytdl_single_options)
ytdl_playlist = yt_dlp.YoutubeDL(ytdl_playlist_options)


def extract_audio_info(data):
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
    
    return abr, acodec, ext


class YTDLSource(discord.PCMVolumeTransformer):
    
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
        audio_url = data.get('url') or data.get('audio_url')
        if not audio_url:
            raise Exception("ไม่พบ URL เสียง")
        
        return cls(
            discord.FFmpegPCMAudio(audio_url, **ffmpeg_options),
            data=data
        )
    
    @classmethod
    async def search(cls, query, *, loop=None, guild_id=None):
        loop = loop or asyncio.get_event_loop()
        
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
            
            if data:
                set_cached_search(query, data)
            
            return data
        finally:
            if guild_id:
                active_requests[guild_id] = max(0, active_requests.get(guild_id, 1) - 1)
    
    @classmethod
    async def extract_playlist(cls, url, *, loop=None, guild_id=None):
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
                    timeout=60
                )
            
            if data is None:
                return None, []
            
            if 'entries' not in data:
                return None, [data]
            
            playlist_name = data.get('title', 'Playlist')
            entries = [e for e in data['entries'] if e][:1000]
            
            return playlist_name, entries
        finally:
            if guild_id:
                active_requests[guild_id] = max(0, active_requests.get(guild_id, 1) - 1)


def get_load_stats():
    return {
        'active_requests': sum(active_requests.values()),
        'max_concurrent': MAX_CONCURRENT_EXTRACTIONS,
        'cache_size': len(search_cache),
        'max_queue': MAX_QUEUE_SIZE,
    }


def clear_search_cache():
    search_cache.clear()
