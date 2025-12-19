import discord
from discord.ext import commands
from discord import ui
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
MY_OWNER_ID = 942687569693528084

# Setup Bot
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!!', intents=intents, help_command=None)

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

# Music Queue System
music_queues = {}
now_playing = {}

def format_duration(seconds):
    """แปลงวินาทีเป็น MM:SS หรือ HH:MM:SS"""
    if not seconds:
        return "Unknown"
    seconds = int(seconds)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"

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


# ==================== UI Components ====================

class MusicControlView(ui.View):
    """ปุ่มควบคุมเพลงแบบ Interactive"""
    def __init__(self, ctx):
        super().__init__(timeout=300)  # 5 นาที
        self.ctx = ctx

    @ui.button(label="⏸️ หยุดชั่วคราว", style=discord.ButtonStyle.secondary)
    async def pause_button(self, interaction: discord.Interaction, button: ui.Button):
        if interaction.guild.voice_client and interaction.guild.voice_client.is_playing():
            interaction.guild.voice_client.pause()
            button.label = "▶️ เล่นต่อ"
            button.style = discord.ButtonStyle.success
            await interaction.response.edit_message(view=self)
            await interaction.followup.send("⏸️ หยุดเพลงชั่วคราวค่ะ", ephemeral=True)
        elif interaction.guild.voice_client and interaction.guild.voice_client.is_paused():
            interaction.guild.voice_client.resume()
            button.label = "⏸️ หยุดชั่วคราว"
            button.style = discord.ButtonStyle.secondary
            await interaction.response.edit_message(view=self)
            await interaction.followup.send("▶️ เล่นเพลงต่อค่ะ", ephemeral=True)
        else:
            await interaction.response.send_message("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ", ephemeral=True)

    @ui.button(label="⏭️ ข้าม", style=discord.ButtonStyle.primary)
    async def skip_button(self, interaction: discord.Interaction, button: ui.Button):
        if interaction.guild.voice_client and (interaction.guild.voice_client.is_playing() or interaction.guild.voice_client.is_paused()):
            interaction.guild.voice_client.stop()
            await interaction.response.send_message("⏭️ ข้ามไปเพลงถัดไปค่ะ~", ephemeral=True)
        else:
            await interaction.response.send_message("❌ ไม่มีเพลงที่จะข้ามนะคะ", ephemeral=True)

    @ui.button(label="📋 ดู Queue", style=discord.ButtonStyle.secondary)
    async def queue_button(self, interaction: discord.Interaction, button: ui.Button):
        queue = get_queue(interaction.guild.id)
        current = now_playing.get(interaction.guild.id)
        
        if not current and len(queue) == 0:
            await interaction.response.send_message("📭 Queue ว่างเปล่าค่ะ", ephemeral=True)
            return
        
        embed = discord.Embed(title="🎵 รายการเพลง", color=0xFF69B4)
        
        if current:
            embed.add_field(
                name="🎶 กำลังเล่น",
                value=f"**{current['title']}**\nขอโดย: {current['requester']}",
                inline=False
            )
        
        if len(queue) > 0:
            queue_list = ""
            for i, song in enumerate(list(queue)[:5], 1):
                queue_list += f"`{i}.` {song['title']}\n"
            if len(queue) > 5:
                queue_list += f"\n... และอีก {len(queue) - 5} เพลงค่ะ"
            embed.add_field(name="📋 ถัดไป", value=queue_list, inline=False)
        
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @ui.button(label="🗑️ ล้าง Queue", style=discord.ButtonStyle.danger)
    async def clear_button(self, interaction: discord.Interaction, button: ui.Button):
        queue = get_queue(interaction.guild.id)
        queue.clear()
        await interaction.response.send_message("🗑️ ล้าง Queue เรียบร้อยแล้วค่ะ~", ephemeral=True)

    @ui.button(label="👋 ออกจากห้อง", style=discord.ButtonStyle.danger)
    async def stop_button(self, interaction: discord.Interaction, button: ui.Button):
        if interaction.guild.voice_client:
            queue = get_queue(interaction.guild.id)
            queue.clear()
            now_playing.pop(interaction.guild.id, None)
            await interaction.guild.voice_client.disconnect()
            await interaction.response.send_message("👋 ลาก่อนนะคะ~ ไว้เรียกหนูมาเล่นเพลงอีกนะคะ!", ephemeral=True)
            self.stop()
        else:
            await interaction.response.send_message("❌ หนูไม่ได้อยู่ในห้องเสียงค่ะ", ephemeral=True)


class HelpView(ui.View):
    """เมนู Help แบบ Interactive พร้อมปุ่ม Back/Forward"""
    
    # หน้าต่างๆ ของ Help
    PAGES = [
        {
            "title": "🌸 สวัสดีค่ะ! หนูชื่อ Meo ค่ะ~",
            "description": "หนูเป็นบอทเล่นเพลงและช่วยเหลือต่างๆ ค่ะ\n\nกดปุ่ม ◀️ ▶️ เพื่อดูหน้าอื่นๆ นะคะ 💕",
            "fields": [
                ("🎵 เพลง", "เล่นเพลงจาก YouTube และอื่นๆ"),
                ("💬 ส่งข้อความ", "ส่งข้อความไปยัง User/Channel"),
                ("⚙️ ระบบ", "คำสั่งสำหรับ Owner"),
            ]
        },
        {
            "title": "🎵 คำสั่งเพลง",
            "description": "คำสั่งเกี่ยวกับการเล่นเพลงค่ะ~",
            "fields": [
                ("!!play <ลิงก์/ชื่อเพลง>", "เล่นเพลงหรือเพิ่มเข้า Queue ค่ะ"),
                ("!!pause", "หยุดเพลงชั่วคราวค่ะ"),
                ("!!resume", "เล่นเพลงต่อค่ะ"),
                ("!!skip", "ข้ามไปเพลงถัดไปค่ะ"),
                ("!!queue หรือ !!q", "ดูรายการเพลงใน Queue ค่ะ"),
                ("!!np", "ดูเพลงที่กำลังเล่นค่ะ"),
                ("!!clear", "ล้าง Queue ค่ะ"),
                ("!!stop", "หยุดเพลงและออกจากห้องค่ะ"),
            ]
        },
        {
            "title": "💬 คำสั่งส่งข้อความ",
            "description": "คำสั่งเกี่ยวกับการส่งข้อความค่ะ~",
            "fields": [
                ("!!sendtext <@user/#channel> <ข้อความ>", "ส่งข้อความไปยัง user หรือ channel ค่ะ (Owner only)"),
                ("!!getfile <ชื่อไฟล์>", "ดึงไฟล์จาก server ค่ะ"),
            ]
        },
        {
            "title": "⚙️ คำสั่งระบบ",
            "description": "คำสั่งสำหรับ Owner เท่านั้นนะคะ~",
            "fields": [
                ("!!cmd <คำสั่ง>", "รันคำสั่ง Shell บน Server ค่ะ"),
                ("!!purge <จำนวน>", "ลบข้อความแบบไม่ถูก log (1-1000) ค่ะ"),
                ("!!help", "แสดงเมนูช่วยเหลือนี้ค่ะ"),
            ]
        },
    ]
    
    def __init__(self):
        super().__init__(timeout=180)
        self.current_page = 0
        self.update_buttons()
    
    def get_embed(self):
        """สร้าง Embed สำหรับหน้าปัจจุบัน"""
        page = self.PAGES[self.current_page]
        embed = discord.Embed(
            title=page["title"],
            description=page["description"],
            color=0xFF69B4
        )
        for name, value in page["fields"]:
            embed.add_field(name=name, value=value, inline=False)
        embed.set_footer(text=f"หน้า {self.current_page + 1}/{len(self.PAGES)} | หนูพร้อมช่วยเสมอค่ะ~ 🎀")
        return embed
    
    def update_buttons(self):
        """อัพเดทสถานะปุ่ม Back/Forward"""
        self.back_button.disabled = self.current_page == 0
        self.forward_button.disabled = self.current_page == len(self.PAGES) - 1
    
    @ui.button(label="◀️ ย้อนกลับ", style=discord.ButtonStyle.secondary, row=0)
    async def back_button(self, interaction: discord.Interaction, button: ui.Button):
        if self.current_page > 0:
            self.current_page -= 1
            self.update_buttons()
            await interaction.response.edit_message(embed=self.get_embed(), view=self)
    
    @ui.button(label="🏠 หน้าแรก", style=discord.ButtonStyle.primary, row=0)
    async def home_button(self, interaction: discord.Interaction, button: ui.Button):
        self.current_page = 0
        self.update_buttons()
        await interaction.response.edit_message(embed=self.get_embed(), view=self)
    
    @ui.button(label="▶️ ถัดไป", style=discord.ButtonStyle.secondary, row=0)
    async def forward_button(self, interaction: discord.Interaction, button: ui.Button):
        if self.current_page < len(self.PAGES) - 1:
            self.current_page += 1
            self.update_buttons()
            await interaction.response.edit_message(embed=self.get_embed(), view=self)
    
    @ui.button(label="🎵 เพลง", style=discord.ButtonStyle.success, row=1)
    async def music_page(self, interaction: discord.Interaction, button: ui.Button):
        self.current_page = 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.get_embed(), view=self)
    
    @ui.button(label="💬 ข้อความ", style=discord.ButtonStyle.success, row=1)
    async def message_page(self, interaction: discord.Interaction, button: ui.Button):
        self.current_page = 2
        self.update_buttons()
        await interaction.response.edit_message(embed=self.get_embed(), view=self)
    
    @ui.button(label="⚙️ ระบบ", style=discord.ButtonStyle.success, row=1)
    async def system_page(self, interaction: discord.Interaction, button: ui.Button):
        self.current_page = 3
        self.update_buttons()
        await interaction.response.edit_message(embed=self.get_embed(), view=self)


# ==================== Events ====================

@bot.event
async def on_ready():
    print(f'Logged in as {bot.user} (ID: {bot.user.id})')
    print('------ System Online ------')
    await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.listening, name="!!help 🎵"))


# ==================== Commands ====================

@bot.command(name='help', aliases=['h', 'commands'])
async def help_command(ctx):
    """แสดงเมนูช่วยเหลือ"""
    view = HelpView()
    await ctx.send(embed=view.get_embed(), view=view)


# --- Zone 1: Automation & System Command ---
@bot.command(name='cmd')
async def shell_command(ctx, *, command):
    if ctx.author.id != MY_OWNER_ID:
        await ctx.send("⛔ ขอโทษนะคะ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ค่ะ 🙏")
        return

    await ctx.send(f"💻 รอสักครู่นะคะ กำลังรัน: `{command}`...")
    
    try:
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        
        output = result.stdout
        if not output:
            output = result.stderr
            
        if len(output) > 1900:
            output = output[:1900] + "\n... (ตัดทอนค่ะ)"
            
        if output.strip() == "":
            await ctx.send("✅ รันเสร็จเรียบร้อยค่ะ~ (ไม่มี Output นะคะ)")
        else:
            await ctx.send(f"```bash\n{output}\n```")
            
    except Exception as e:
        await ctx.send(f"❌ เกิดข้อผิดพลาดค่ะ: {e}")


# --- Zone 2: File Transfer ---
@bot.command()
async def getfile(ctx, filename):
    if os.path.exists(filename):
        await ctx.send("📎 นี่ค่ะ ไฟล์ที่ขอมาค่ะ~", file=discord.File(filename))
    else:
        await ctx.send(f"❌ ขอโทษนะคะ หาไฟล์ `{filename}` ไม่เจอค่ะ 🥺")


# --- Zone 3: DM Commands ---
@bot.command(name='sendtext')
async def send_text_to(ctx, target: str, *, message: str):
    if ctx.author.id != MY_OWNER_ID:
        await ctx.send("⛔ ขอโทษนะคะ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ค่ะ 🙏")
        return
    
    try:
        destination = None
        target_type = None
        
        if target.startswith('<@') and target.endswith('>'):
            user_id = target.replace('<@', '').replace('!', '').replace('>', '')
            destination = await bot.fetch_user(int(user_id))
            target_type = "user"
        
        elif target.startswith('<#') and target.endswith('>'):
            channel_id = target.replace('<#', '').replace('>', '')
            destination = bot.get_channel(int(channel_id))
            target_type = "channel"
        
        elif target.isdigit():
            target_id = int(target)
            destination = bot.get_channel(target_id)
            target_type = "channel"
            
            if destination is None:
                destination = await bot.fetch_user(target_id)
                target_type = "user"
        
        else:
            await ctx.send("❌ รูปแบบไม่ถูกต้องนะคะ ใช้: `@user`, `#channel`, หรือ `ID` ค่ะ")
            return
        
        if destination is None:
            await ctx.send(f"❌ หาไม่เจอค่ะ: `{target}` 🥺")
            return
        
        await destination.send(message)
        
        if target_type == "channel":
            await ctx.send(f"✅ ส่งข้อความไปยัง channel **{destination.name}** เรียบร้อยแล้วค่ะ~ 💕")
        else:
            await ctx.send(f"✅ ส่งข้อความไปยัง DM ของ **{destination.name}** เรียบร้อยแล้วค่ะ~ 💕")
            
    except discord.Forbidden:
        await ctx.send("❌ ขอโทษนะคะ หนูไม่มีสิทธิ์ส่งข้อความไปที่นั่นค่ะ 🥺")
    except discord.NotFound:
        await ctx.send(f"❌ หาไม่เจอค่ะ: `{target}` 🥺")
    except ValueError:
        await ctx.send("❌ ID ไม่ถูกต้องนะคะ")
    except Exception as e:
        await ctx.send(f"❌ เกิดข้อผิดพลาดค่ะ: {e}")


# --- Zone 4: Message Management ---
@bot.command(name='purge', aliases=['clear_msg', 'del'])
async def purge_messages(ctx, amount: int = None):
    """ลบข้อความแบบ bulk delete (ไม่ถูก log โดย bot อื่น)"""
    if ctx.author.id != MY_OWNER_ID:
        await ctx.send("⛔ ขอโทษนะคะ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ค่ะ 🙏")
        return
    
    if amount is None:
        await ctx.send("❌ กรุณาระบุจำนวนข้อความที่ต้องการลบค่ะ เช่น `!!purge 10`")
        return
    
    if amount < 1:
        await ctx.send("❌ จำนวนต้องมากกว่า 0 ค่ะ~")
        return
    
    if amount > 1000:
        await ctx.send("❌ ลบได้ไม่เกิน 1000 ข้อความต่อครั้งนะคะ~")
        return
    
    try:
        # +1 เพื่อรวมคำสั่ง purge ด้วย
        deleted = await ctx.channel.purge(limit=amount + 1, bulk=True)
        
        # ส่งข้อความยืนยันและลบหลัง 3 วินาที
        confirm_msg = await ctx.send(f"🗑️ ลบไป **{len(deleted) - 1}** ข้อความแล้วค่ะ~ ✨")
        await asyncio.sleep(3)
        await confirm_msg.delete()
        
    except discord.Forbidden:
        await ctx.send("❌ หนูไม่มีสิทธิ์ลบข้อความในช่องนี้ค่ะ 🥺")
    except discord.HTTPException as e:
        if 'older than 14 days' in str(e):
            await ctx.send("❌ ไม่สามารถ bulk delete ข้อความที่เก่ากว่า 14 วันได้ค่ะ~")
        else:
            await ctx.send(f"❌ เกิดข้อผิดพลาดค่ะ: {e}")


# --- Zone 5: Music with Queue System ---
def get_queue(guild_id):
    if guild_id not in music_queues:
        music_queues[guild_id] = deque()
    return music_queues[guild_id]

async def play_next(ctx):
    queue = get_queue(ctx.guild.id)
    
    if len(queue) > 0:
        next_song = queue.popleft()
        
        try:
            # ใช้ cached data ถ้ามี (เร็วกว่า)
            if 'audio_url' in next_song:
                player = await YTDLSource.from_data({
                    'url': next_song['audio_url'],
                    'title': next_song['title'],
                    'duration': next_song.get('duration'),
                    'abr': next_song.get('abr'),
                    'acodec': next_song.get('acodec'),
                    'ext': next_song.get('ext'),
                }, loop=bot.loop)
            else:
                # ถ้าไม่มี cache ให้ดึงใหม่
                player = await YTDLSource.from_url(next_song['url'], loop=bot.loop)
            
            now_playing[ctx.guild.id] = {
                'title': player.title or next_song['title'],
                'url': next_song['url'],
                'requester': next_song['requester'],
                'duration': player.duration or next_song.get('duration'),
                'abr': player.abr or next_song.get('abr'),
                'acodec': player.acodec or next_song.get('acodec'),
                'ext': player.ext or next_song.get('ext'),
            }
            
            def after_playing(error):
                if error:
                    print(f'Player error: {error}')
                asyncio.run_coroutine_threadsafe(play_next(ctx), bot.loop)
            
            ctx.voice_client.play(player, after=after_playing)
            
            # สร้าง embed
            current = now_playing[ctx.guild.id]
            duration_str = format_duration(current['duration'])
            
            # Quality info
            quality_parts = []
            if current['abr']:
                quality_parts.append(f"{int(current['abr'])}kbps")
            if current['acodec']:
                quality_parts.append(current['acodec'].upper())
            elif current['ext']:
                quality_parts.append(current['ext'].upper())
            quality_str = " • ".join(quality_parts) if quality_parts else "Auto"
            
            embed = discord.Embed(
                title="🎶 กำลังเล่นเพลงค่ะ~",
                description=f"**{current['title']}**",
                color=0xFF69B4
            )
            embed.add_field(name="⏱️ ความยาว", value=duration_str, inline=True)
            embed.add_field(name="🎧 คุณภาพ", value=quality_str, inline=True)
            embed.add_field(name="📋 Queue", value=f"{len(queue)} เพลง", inline=True)
            embed.set_footer(text=f"ขอโดย: {next_song['requester']} 💕")
            await ctx.send(embed=embed, view=MusicControlView(ctx))
            
        except Exception as e:
            await ctx.send(f"❌ เกิดข้อผิดพลาดในการเล่นเพลงค่ะ: {e}")
            # ลองเพลงถัดไป
            await play_next(ctx)
    else:
        now_playing.pop(ctx.guild.id, None)
        await ctx.send("📭 เพลงใน Queue หมดแล้วค่ะ~ ขอเพลงใหม่ได้เลยนะคะ 🎵")

@bot.command()
async def play(ctx, *, url):
    """เล่นเพลงหรือเพิ่มเข้า queue (รองรับ playlist)"""
    if not ctx.message.author.voice:
        await ctx.send("❌ คุณต้องเข้าห้องเสียงก่อนนะคะ~ 🎤")
        return

    channel = ctx.message.author.voice.channel
    
    if ctx.voice_client is None:
        await channel.connect()
        await ctx.send(f"🎀 หนูเข้าห้อง **{channel.name}** แล้วค่ะ~")
    
    queue = get_queue(ctx.guild.id)
    
    # แสดงสถานะกำลังค้นหา
    status_msg = await ctx.send("🔍 กำลังค้นหาเพลงค่ะ...")
    
    try:
        # ตรวจสอบว่าเป็น playlist หรือไม่
        is_playlist = 'list=' in url or 'playlist' in url.lower()
        
        if is_playlist:
            # ดึงข้อมูล playlist
            await status_msg.edit(content="📚 กำลังโหลด Playlist ค่ะ...")
            data = await bot.loop.run_in_executor(None, lambda: ytdl.extract_info(url, download=False))
            
            if 'entries' not in data:
                # ไม่ใช่ playlist จริงๆ ให้เล่นเป็นเพลงเดี่ยว
                is_playlist = False
            else:
                entries = [e for e in data['entries'] if e]  # กรอง None entries
                playlist_title = data.get('title', 'Playlist')
                
                # จำกัด 50 เพลง
                max_songs = 200
                entries = entries[:max_songs]
                
                await status_msg.edit(content=f"🎵 พบ {len(entries)} เพลง กำลังเพิ่มเข้า Queue ค่ะ...")
                
                added_count = 0
                for entry in entries:
                    if entry is None:
                        continue
                    
                    song_url = entry.get('url') or entry.get('webpage_url') or f"https://youtube.com/watch?v={entry.get('id')}"
                    song_title = entry.get('title', 'Unknown')
                    
                    song_info = {
                        'url': song_url,
                        'title': song_title,
                        'requester': ctx.author.name
                    }
                    queue.append(song_info)
                    added_count += 1
                
                await status_msg.delete()
                
                embed = discord.Embed(
                    title="📚 เพิ่ม Playlist เข้า Queue แล้วค่ะ~",
                    description=f"**{playlist_title}**\n\n🎵 เพิ่ม {added_count} เพลงเข้า Queue",
                    color=0xFF69B4
                )
                embed.set_footer(text=f"ขอโดย: {ctx.author.name} 💕")
                await ctx.send(embed=embed)
                
                # ถ้าไม่ได้เล่นอยู่ ให้เริ่มเล่น
                if not (ctx.voice_client.is_playing() or ctx.voice_client.is_paused()):
                    await play_next(ctx)
                return
        
        if not is_playlist:
            # เพลงเดี่ยว - ใช้ ytdl_single เพื่อดึง audio URL ด้วย
            data = await bot.loop.run_in_executor(None, lambda: ytdl_single.extract_info(url, download=False))
            if 'entries' in data:
                data = data['entries'][0]
            
            song_title = data.get('title', 'Unknown')
            audio_url = data.get('url')
            duration = data.get('duration')
            abr = data.get('abr')
            acodec = data.get('acodec')
            ext = data.get('ext')
            
            await status_msg.delete()
            
            # แสดงข้อมูลคุณภาพ
            duration_str = format_duration(duration)
            quality_parts = []
            if abr:
                quality_parts.append(f"{int(abr)}kbps")
            if acodec:
                quality_parts.append(acodec.upper())
            quality_str = " • ".join(quality_parts) if quality_parts else ""
            
            song_info = {
                'url': url,
                'title': song_title,
                'audio_url': audio_url,
                'duration': duration,
                'abr': abr,
                'acodec': acodec,
                'ext': ext,
                'requester': ctx.author.name
            }
            
            if ctx.voice_client.is_playing() or ctx.voice_client.is_paused():
                queue.append(song_info)
                embed = discord.Embed(
                    title="📥 เพิ่มเข้า Queue แล้วค่ะ~",
                    description=f"**{song_title}**",
                    color=0xFF69B4
                )
                extra_info = f"⏱️ {duration_str}"
                if quality_str:
                    extra_info += f" • 🎧 {quality_str}"
                embed.add_field(name="ℹ️ ข้อมูล", value=extra_info, inline=False)
                embed.set_footer(text=f"ตำแหน่ง #{len(queue)} | ขอโดย: {ctx.author.name}")
                await ctx.send(embed=embed)
            else:
                queue.append(song_info)
                await play_next(ctx)
        
    except Exception as e:
        await status_msg.edit(content=f"❌ ไม่สามารถโหลดเพลงได้ค่ะ: {e} 🥺")
        return

@bot.command()
async def pause(ctx):
    if ctx.voice_client and ctx.voice_client.is_playing():
        ctx.voice_client.pause()
        await ctx.send("⏸️ หยุดเพลงชั่วคราวค่ะ~ กด `!!resume` เพื่อเล่นต่อนะคะ 🎵")
    else:
        await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~")

@bot.command()
async def resume(ctx):
    if ctx.voice_client and ctx.voice_client.is_paused():
        ctx.voice_client.resume()
        await ctx.send("▶️ เล่นเพลงต่อค่ะ~ 🎶")
    else:
        await ctx.send("❌ ไม่มีเพลงที่หยุดอยู่นะคะ~")

@bot.command()
async def skip(ctx):
    if ctx.voice_client and (ctx.voice_client.is_playing() or ctx.voice_client.is_paused()):
        ctx.voice_client.stop()
        await ctx.send("⏭️ ข้ามไปเพลงถัดไปค่ะ~")
    else:
        await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~")

@bot.command(name='queue', aliases=['q'])
async def show_queue(ctx):
    queue = get_queue(ctx.guild.id)
    current = now_playing.get(ctx.guild.id)
    
    if not current and len(queue) == 0:
        await ctx.send("📭 Queue ว่างเปล่าค่ะ~ ขอเพลงได้เลยนะคะ! 🎵")
        return
    
    embed = discord.Embed(title="🎵 รายการเพลง", color=0xFF69B4)
    
    if current:
        embed.add_field(
            name="🎶 กำลังเล่น",
            value=f"**{current['title']}**\nขอโดย: {current['requester']}",
            inline=False
        )
    
    if len(queue) > 0:
        queue_list = ""
        for i, song in enumerate(list(queue)[:10], 1):
            queue_list += f"`{i}.` {song['title']} - {song['requester']}\n"
        
        if len(queue) > 10:
            queue_list += f"\n... และอีก {len(queue) - 10} เพลงค่ะ"
        
        embed.add_field(name="📋 ถัดไป", value=queue_list, inline=False)
    
    embed.set_footer(text=f"ทั้งหมด {len(queue)} เพลงใน Queue ค่ะ 💕")
    await ctx.send(embed=embed, view=MusicControlView(ctx))

@bot.command(name='np', aliases=['nowplaying'])
async def now_playing_cmd(ctx):
    current = now_playing.get(ctx.guild.id)
    
    if current:
        duration_str = format_duration(current.get('duration'))
        
        # Quality info
        quality_parts = []
        if current.get('abr'):
            quality_parts.append(f"{int(current['abr'])}kbps")
        if current.get('acodec'):
            quality_parts.append(current['acodec'].upper())
        elif current.get('ext'):
            quality_parts.append(current['ext'].upper())
        quality_str = " • ".join(quality_parts) if quality_parts else "Auto"
        
        embed = discord.Embed(title="🎶 กำลังเล่นอยู่ค่ะ~", color=0xFF69B4)
        embed.add_field(name="🎵 เพลง", value=f"**{current['title']}**", inline=False)
        embed.add_field(name="⏱️ ความยาว", value=duration_str, inline=True)
        embed.add_field(name="🎧 คุณภาพ", value=quality_str, inline=True)
        embed.add_field(name="📋 Queue", value=f"{len(get_queue(ctx.guild.id))} เพลง", inline=True)
        embed.add_field(name="👤 ขอโดย", value=current['requester'], inline=True)
        embed.set_footer(text="เพลงเพราะมากเลยค่ะ~ 💕")
        await ctx.send(embed=embed, view=MusicControlView(ctx))
    else:
        await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~ ขอเพลงได้เลยค่ะ! 🎵")

@bot.command()
async def clear(ctx):
    queue = get_queue(ctx.guild.id)
    queue.clear()
    await ctx.send("🗑️ ล้าง Queue เรียบร้อยแล้วค่ะ~ 💕")

@bot.command()
async def stop(ctx):
    if ctx.voice_client:
        queue = get_queue(ctx.guild.id)
        queue.clear()
        now_playing.pop(ctx.guild.id, None)
        await ctx.voice_client.disconnect()
        await ctx.send("👋 ลาก่อนนะคะ~ ไว้เรียกหนูมาเล่นเพลงอีกนะคะ! 🎀")


# Start Bot
if TOKEN:
    bot.run(TOKEN)
else:
    print("Error: ไม่พบ Token ในไฟล์ .env")