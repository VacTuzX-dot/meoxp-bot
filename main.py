import discord
from discord.ext import commands
import os
import subprocess
from dotenv import load_dotenv
import yt_dlp
import asyncio
from collections import deque

# --- CONFIG ---
load_dotenv()
TOKEN = os.getenv('DISCORD_TOKEN')

# ใส่ Discord ID ของคุณคนเดียวเท่านั้น (เพื่อความปลอดภัยตอนสั่งรัน Command)
# วิธีหา: คลิกขวาที่ชื่อตัวเองใน Discord -> Copy User ID (ต้องเปิด Developer Mode ก่อน)
MY_OWNER_ID = 942687569693528084  # <--- แก้ตรงนี้เป็น ID คุณ!!!

# Setup Bot
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

# Setup สำหรับ yt-dlp (โหลดเพลง) - คุณภาพสูงสุด
ytdl_format_options = {
    'format': 'bestaudio[acodec=opus]/bestaudio[acodec=vorbis]/bestaudio/best',
    'outtmpl': '%(extractor)s-%(id)s-%(title)s.%(ext)s',
    'restrictfilenames': True,
    'noplaylist': True,
    'nocheckcertificate': True,
    'ignoreerrors': False,
    'logtostderr': False,
    'quiet': True,
    'no_warnings': True,
    'default_search': 'auto',
    'source_address': '0.0.0.0',
    'postprocessors': [{
        'key': 'FFmpegExtractAudio',
        'preferredcodec': 'opus',
        'preferredquality': '320',  # Bitrate สูงสุด
    }],
}
ffmpeg_options = {
    'options': '-vn -b:a 320k',  # Bitrate 320kbps
    # แก้ปัญหาเพลงกระตุก
    'before_options': '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5'
}
ytdl = yt_dlp.YoutubeDL(ytdl_format_options)

# Music Queue System
music_queues = {}  # guild_id -> deque of songs
now_playing = {}   # guild_id -> current song info

class YTDLSource(discord.PCMVolumeTransformer):
    def __init__(self, source, *, data, volume=0.5):
        super().__init__(source, volume)
        self.data = data
        self.title = data.get('title')
        self.url = data.get('url')

    @classmethod
    async def from_url(cls, url, *, loop=None, stream=False):
        loop = loop or asyncio.get_event_loop()
        data = await loop.run_in_executor(None, lambda: ytdl.extract_info(url, download=not stream))
        if 'entries' in data:
            data = data['entries'][0]
        filename = data['url'] if stream else ytdl.prepare_filename(data)
        return cls(discord.FFmpegPCMAudio(filename, **ffmpeg_options), data=data)

@bot.event
async def on_ready():
    print(f'Logged in as {bot.user} (ID: {bot.user.id})')
    print('------ System Online on macOS ------')

# --- Zone 1: Automation & System Command ---
@bot.command(name='cmd')
async def shell_command(ctx, *, command):
    # เช็คว่าเป็นเราสั่งคนเดียวไหม
    if ctx.author.id != MY_OWNER_ID:
        await ctx.send("⛔ Access Denied: คุณไม่มีสิทธิ์สั่ง Server นี้")
        return

    await ctx.send(f"💻 Mac Executing: `{command}`...")
    
    try:
        # รันคำสั่งจริงบน Mac
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        
        output = result.stdout
        if not output:
            output = result.stderr # ถ้าไม่มี output ให้เอา error มาโชว์
            
        if len(output) > 1900: # Discord limit
            output = output[:1900] + "\n... (ตัดทอน)"
            
        if output.strip() == "":
            await ctx.send("✅ รันเสร็จสิ้น (ไม่มี Output)")
        else:
            await ctx.send(f"```bash\n{output}\n```")
            
    except Exception as e:
        await ctx.send(f"❌ Error: {e}")

# --- Zone 2: File Transfer ---
@bot.command()
async def getfile(ctx, filename):
    # ดึงไฟล์จาก Folder โปรเจกต์ไปส่งในแชท
    if os.path.exists(filename):
        await ctx.send(file=discord.File(filename))
    else:
        await ctx.send(f"หาไฟล์ `{filename}` ไม่เจอค่ะ")

# --- Zone 3: DM Commands (ส่งข้อความไปยังที่อื่น) ---
@bot.command(name='sendtext')
async def send_text_to(ctx, target: str, *, message: str):
    """
    ส่งข้อความไปยัง channel หรือ user อื่น
    Usage: !sendtext <@user หรือ #channel หรือ ID> <message>
    ตัวอย่าง: 
      !sendtext @username สวัสดีครับ!
      !sendtext 123456789 สวัสดีครับ!
    """
    # เช็คว่าเป็น owner ไหม
    if ctx.author.id != MY_OWNER_ID:
        await ctx.send("⛔ Access Denied: คุณไม่มีสิทธิ์ใช้คำสั่งนี้")
        return
    
    try:
        destination = None
        target_type = None
        
        # เช็คว่าเป็น mention user ไหม (<@123456789> หรือ <@!123456789>)
        if target.startswith('<@') and target.endswith('>'):
            user_id = target.replace('<@', '').replace('!', '').replace('>', '')
            destination = await bot.fetch_user(int(user_id))
            target_type = "user"
        
        # เช็คว่าเป็น mention channel ไหม (<#123456789>)
        elif target.startswith('<#') and target.endswith('>'):
            channel_id = target.replace('<#', '').replace('>', '')
            destination = bot.get_channel(int(channel_id))
            target_type = "channel"
        
        # ถ้าเป็น ID ตัวเลขตรงๆ
        elif target.isdigit():
            target_id = int(target)
            # ลอง fetch เป็น channel ก่อน
            destination = bot.get_channel(target_id)
            target_type = "channel"
            
            # ถ้าไม่ใช่ channel ให้ลอง fetch เป็น user
            if destination is None:
                destination = await bot.fetch_user(target_id)
                target_type = "user"
        
        else:
            await ctx.send("❌ รูปแบบไม่ถูกต้อง ใช้: `@user`, `#channel`, หรือ `ID`")
            return
        
        if destination is None:
            await ctx.send(f"❌ ไม่พบ channel/user: `{target}`")
            return
        
        # ส่งข้อความ
        await destination.send(message)
        
        if target_type == "channel":
            await ctx.send(f"✅ ส่งข้อความไปยัง channel **{destination.name}** สำเร็จ!")
        else:
            await ctx.send(f"✅ ส่งข้อความไปยัง DM ของ **{destination.name}** สำเร็จ!")
            
    except discord.Forbidden:
        await ctx.send("❌ ไม่มีสิทธิ์ส่งข้อความไปยัง channel/user นี้")
    except discord.NotFound:
        await ctx.send(f"❌ ไม่พบ channel/user: `{target}`")
    except ValueError:
        await ctx.send("❌ ID ไม่ถูกต้อง")
    except Exception as e:
        await ctx.send(f"❌ Error: {e}")


# --- Zone 4: Music with Queue System ---
def get_queue(guild_id):
    """ดึง queue ของ server หรือสร้างใหม่ถ้ายังไม่มี"""
    if guild_id not in music_queues:
        music_queues[guild_id] = deque()
    return music_queues[guild_id]

async def play_next(ctx):
    """เล่นเพลงถัดไปใน queue"""
    queue = get_queue(ctx.guild.id)
    
    if len(queue) > 0:
        next_song = queue.popleft()
        
        async with ctx.typing():
            player = await YTDLSource.from_url(next_song['url'], loop=bot.loop, stream=True)
            now_playing[ctx.guild.id] = {'title': player.title, 'url': next_song['url'], 'requester': next_song['requester']}
            
            def after_playing(error):
                if error:
                    print(f'Player error: {error}')
                # เล่นเพลงถัดไป
                asyncio.run_coroutine_threadsafe(play_next(ctx), bot.loop)
            
            ctx.voice_client.play(player, after=after_playing)
        
        await ctx.send(f'🎶 กำลังเล่น: **{player.title}**')
    else:
        now_playing.pop(ctx.guild.id, None)
        await ctx.send("📭 Queue หมดแล้ว!")

@bot.command()
async def play(ctx, *, url):
    """เล่นเพลงหรือเพิ่มเข้า queue"""
    if not ctx.message.author.voice:
        await ctx.send("❌ คุณต้องเข้าห้องเสียงก่อน!")
        return

    channel = ctx.message.author.voice.channel
    
    # ถ้าบอทยังไม่เข้าห้อง ให้เข้า
    if ctx.voice_client is None:
        await channel.connect()
    
    queue = get_queue(ctx.guild.id)
    
    # ดึงข้อมูลเพลง
    async with ctx.typing():
        try:
            data = await bot.loop.run_in_executor(None, lambda: ytdl.extract_info(url, download=False))
            if 'entries' in data:
                data = data['entries'][0]
            song_title = data.get('title', 'Unknown')
        except Exception as e:
            await ctx.send(f"❌ ไม่สามารถโหลดเพลงได้: {e}")
            return
    
    song_info = {
        'url': url,
        'title': song_title,
        'requester': ctx.author.name
    }
    
    # ถ้ากำลังเล่นอยู่ ให้เพิ่มเข้า queue
    if ctx.voice_client.is_playing() or ctx.voice_client.is_paused():
        queue.append(song_info)
        await ctx.send(f'📥 เพิ่มเข้า Queue: **{song_title}** (ตำแหน่ง #{len(queue)})')
    else:
        # ถ้าไม่ได้เล่นอยู่ ให้เล่นเลย
        queue.append(song_info)
        await play_next(ctx)

@bot.command()
async def pause(ctx):
    """หยุดเพลงชั่วคราว"""
    if ctx.voice_client and ctx.voice_client.is_playing():
        ctx.voice_client.pause()
        await ctx.send("⏸️ หยุดเพลงชั่วคราว")
    else:
        await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่")

@bot.command()
async def resume(ctx):
    """เล่นเพลงต่อ"""
    if ctx.voice_client and ctx.voice_client.is_paused():
        ctx.voice_client.resume()
        await ctx.send("▶️ เล่นเพลงต่อ")
    else:
        await ctx.send("❌ ไม่มีเพลงที่หยุดอยู่")

@bot.command()
async def skip(ctx):
    """ข้ามไปเพลงถัดไป"""
    if ctx.voice_client and (ctx.voice_client.is_playing() or ctx.voice_client.is_paused()):
        ctx.voice_client.stop()  # จะ trigger after callback ที่เล่นเพลงถัดไป
        await ctx.send("⏭️ ข้ามเพลง...")
    else:
        await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่")

@bot.command(name='queue', aliases=['q'])
async def show_queue(ctx):
    """แสดงรายการเพลงใน queue"""
    queue = get_queue(ctx.guild.id)
    current = now_playing.get(ctx.guild.id)
    
    if not current and len(queue) == 0:
        await ctx.send("📭 Queue ว่างเปล่า")
        return
    
    embed = discord.Embed(title="🎵 Music Queue", color=0x1DB954)
    
    # เพลงที่กำลังเล่น
    if current:
        embed.add_field(
            name="🎶 กำลังเล่น",
            value=f"**{current['title']}**\nRequested by: {current['requester']}",
            inline=False
        )
    
    # รายการใน queue
    if len(queue) > 0:
        queue_list = ""
        for i, song in enumerate(list(queue)[:10], 1):  # แสดงแค่ 10 เพลงแรก
            queue_list += f"`{i}.` {song['title']} - {song['requester']}\n"
        
        if len(queue) > 10:
            queue_list += f"\n... และอีก {len(queue) - 10} เพลง"
        
        embed.add_field(name="📋 ถัดไป", value=queue_list, inline=False)
    
    embed.set_footer(text=f"ทั้งหมด {len(queue)} เพลงใน queue")
    await ctx.send(embed=embed)

@bot.command(name='np', aliases=['nowplaying'])
async def now_playing_cmd(ctx):
    """แสดงเพลงที่กำลังเล่นอยู่"""
    current = now_playing.get(ctx.guild.id)
    
    if current:
        embed = discord.Embed(title="🎶 Now Playing", color=0x1DB954)
        embed.add_field(name="เพลง", value=f"**{current['title']}**", inline=False)
        embed.add_field(name="Requested by", value=current['requester'], inline=True)
        await ctx.send(embed=embed)
    else:
        await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่")

@bot.command()
async def clear(ctx):
    """ล้าง queue ทั้งหมด"""
    queue = get_queue(ctx.guild.id)
    queue.clear()
    await ctx.send("🗑️ ล้าง Queue เรียบร้อย!")

@bot.command()
async def stop(ctx):
    """หยุดเพลงและออกจากห้อง"""
    if ctx.voice_client:
        queue = get_queue(ctx.guild.id)
        queue.clear()
        now_playing.pop(ctx.guild.id, None)
        await ctx.voice_client.disconnect()
        await ctx.send("👋 ออกจากห้องแล้ว")

# Start Bot
if TOKEN:
    bot.run(TOKEN)
else:
    print("Error: ไม่พบ Token ในไฟล์ .env")