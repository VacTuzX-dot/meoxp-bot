import discord
from discord.ext import commands
from collections import deque
import asyncio

from config import bot
from utils.ytdl import YTDLSource, ytdl, ytdl_single
from views.music_controls import MusicControlView


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


def get_queue(guild_id):
    if guild_id not in music_queues:
        music_queues[guild_id] = deque()
    return music_queues[guild_id]


class Music(commands.Cog):
    """Music commands cog"""
    
    def __init__(self, bot):
        self.bot = bot
    
    async def play_next(self, ctx):
        queue = get_queue(ctx.guild.id)
        
        # Import here to avoid circular import
        from cogs.events import auto_leave_pending
        
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
                    }, loop=self.bot.loop)
                else:
                    # ถ้าไม่มี cache ให้ดึงใหม่
                    player = await YTDLSource.from_url(next_song['url'], loop=self.bot.loop)
                
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
                    asyncio.run_coroutine_threadsafe(self.play_next(ctx), self.bot.loop)
                
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
                await ctx.send(embed=embed, view=MusicControlView(ctx, get_queue, now_playing))
                
            except Exception as e:
                await ctx.send(f"❌ เกิดข้อผิดพลาดในการเล่นเพลงค่ะ: {e}")
                # ลองเพลงถัดไป
                await self.play_next(ctx)
        else:
            now_playing.pop(ctx.guild.id, None)
            # ไม่ส่งข้อความถ้ากำลัง auto-leave
            if ctx.guild.id not in auto_leave_pending:
                await ctx.send("📭 เพลงใน Queue หมดแล้วค่ะ~ ขอเพลงใหม่ได้เลยนะคะ 🎵")

    @commands.command()
    async def play(self, ctx, *, url):
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
                data = await self.bot.loop.run_in_executor(None, lambda: ytdl.extract_info(url, download=False))
                
                if 'entries' not in data:
                    # ไม่ใช่ playlist จริงๆ ให้เล่นเป็นเพลงเดี่ยว
                    is_playlist = False
                else:
                    entries = [e for e in data['entries'] if e]  # กรอง None entries
                    playlist_title = data.get('title', 'Playlist')
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
                        await self.play_next(ctx)
                    return
            
            if not is_playlist:
                # เพลงเดี่ยว - ใช้ ytdl_single เพื่อดึง audio URL ด้วย
                data = await self.bot.loop.run_in_executor(None, lambda: ytdl_single.extract_info(url, download=False))
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
                    await self.play_next(ctx)
            
        except Exception as e:
            await status_msg.edit(content=f"❌ ไม่สามารถโหลดเพลงได้ค่ะ: {e} 🥺")
            return

    @commands.command()
    async def pause(self, ctx):
        if ctx.voice_client and ctx.voice_client.is_playing():
            ctx.voice_client.pause()
            await ctx.send("⏸️ หยุดเพลงชั่วคราวค่ะ~ กด `!!resume` เพื่อเล่นต่อนะคะ 🎵")
        else:
            await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~")

    @commands.command()
    async def resume(self, ctx):
        if ctx.voice_client and ctx.voice_client.is_paused():
            ctx.voice_client.resume()
            await ctx.send("▶️ เล่นเพลงต่อค่ะ~ 🎶")
        else:
            await ctx.send("❌ ไม่มีเพลงที่หยุดอยู่นะคะ~")

    @commands.command()
    async def skip(self, ctx):
        if ctx.voice_client and (ctx.voice_client.is_playing() or ctx.voice_client.is_paused()):
            ctx.voice_client.stop()
            await ctx.send("⏭️ ข้ามไปเพลงถัดไปค่ะ~")
        else:
            await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~")

    @commands.command(name='queue', aliases=['q'])
    async def show_queue(self, ctx):
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
        await ctx.send(embed=embed, view=MusicControlView(ctx, get_queue, now_playing))

    @commands.command(name='np', aliases=['nowplaying'])
    async def now_playing_cmd(self, ctx):
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
            await ctx.send(embed=embed, view=MusicControlView(ctx, get_queue, now_playing))
        else:
            await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~ ขอเพลงได้เลยค่ะ! 🎵")

    @commands.command()
    async def clear(self, ctx):
        queue = get_queue(ctx.guild.id)
        queue.clear()
        await ctx.send("🗑️ ล้าง Queue เรียบร้อยแล้วค่ะ~ 💕")

    @commands.command()
    async def stop(self, ctx):
        if ctx.voice_client:
            queue = get_queue(ctx.guild.id)
            queue.clear()
            now_playing.pop(ctx.guild.id, None)
            await ctx.voice_client.disconnect()
            await ctx.send("👋 ลาก่อนนะคะ~ ไว้เรียกหนูมาเล่นเพลงอีกนะคะ! 🎀")


async def setup(bot):
    await bot.add_cog(Music(bot))
