import discord
from discord.ext import commands
from collections import deque
import asyncio

from config import bot
from utils.ytdl import YTDLSource, ytdl_single
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
    """Music commands cog - using yt-dlp (optimized)"""
    
    def __init__(self, bot):
        self.bot = bot
    
    async def play_next(self, ctx):
        """เล่นเพลงถัดไปใน queue"""
        queue = get_queue(ctx.guild.id)
        
        # Import here to avoid circular import
        from cogs.events import auto_leave_pending
        
        if len(queue) > 0:
            next_song = queue.popleft()
            
            try:
                # Use cached audio_url if available (faster)
                if 'audio_url' in next_song and next_song['audio_url']:
                    player = await YTDLSource.from_data({
                        'url': next_song['audio_url'],
                        'title': next_song['title'],
                        'duration': next_song.get('duration'),
                        'abr': next_song.get('abr'),
                        'acodec': next_song.get('acodec'),
                        'ext': next_song.get('ext'),
                        'thumbnail': next_song.get('thumbnail'),
                        'uploader': next_song.get('uploader'),
                    }, loop=self.bot.loop)
                else:
                    # Extract fresh data
                    player = await YTDLSource.from_url(
                        next_song['url'], loop=self.bot.loop,
                        guild_id=ctx.guild.id
                    )
                
                # Store now playing info
                now_playing[ctx.guild.id] = {
                    'title': player.title,
                    'url': next_song.get('url') or next_song.get('webpage_url'),
                    'requester': next_song['requester'],
                    'duration': player.duration,
                    'abr': player.abr,
                    'acodec': player.acodec,
                    'thumbnail': player.thumbnail,
                    'uploader': player.uploader,
                }
                
                def after_playing(error):
                    if error:
                        print(f'Player error: {error}')
                    asyncio.run_coroutine_threadsafe(
                        self.play_next(ctx), self.bot.loop
                    )
                
                ctx.voice_client.play(player, after=after_playing)
                
                # Create embed
                current = now_playing[ctx.guild.id]
                duration_str = format_duration(current['duration'])
                
                # Quality info
                quality_parts = []
                if current['abr']:
                    quality_parts.append(f"{int(current['abr'])}kbps")
                if current['acodec']:
                    quality_parts.append(current['acodec'].upper())
                quality_str = " • ".join(quality_parts) if quality_parts else "Auto"
                
                embed = discord.Embed(
                    title="🎶 กำลังเล่นเพลงค่ะ~",
                    description=f"**{current['title']}**",
                    color=0xFF69B4
                )
                embed.add_field(name="⏱️ ความยาว", value=duration_str, inline=True)
                embed.add_field(name="🎧 คุณภาพ", value=quality_str, inline=True)
                embed.add_field(name="📋 Queue", value=f"{len(queue)} เพลง", inline=True)
                if current.get('uploader'):
                    embed.add_field(name="👤 ช่อง", value=current['uploader'], inline=True)
                embed.set_footer(text=f"ขอโดย: {next_song['requester']} 💕")
                
                if current.get('thumbnail'):
                    embed.set_thumbnail(url=current['thumbnail'])
                
                await ctx.send(embed=embed, view=MusicControlView(ctx, get_queue, now_playing))
                
            except Exception as e:
                await ctx.send(f"❌ เกิดข้อผิดพลาดในการเล่นเพลงค่ะ: {e}")
                # Try next song
                await self.play_next(ctx)
        else:
            now_playing.pop(ctx.guild.id, None)
            if ctx.guild.id not in auto_leave_pending:
                await ctx.send("📭 เพลงใน Queue หมดแล้วค่ะ~ ขอเพลงใหม่ได้เลยนะคะ 🎵")

    @commands.command()
    async def play(self, ctx, *, query: str):
        """เล่นเพลงหรือเพิ่มเข้า queue (รองรับ playlist)"""
        if not ctx.message.author.voice:
            await ctx.send("❌ คุณต้องเข้าห้องเสียงก่อนนะคะ~ 🎤")
            return

        channel = ctx.message.author.voice.channel
        
        if ctx.voice_client is None:
            await channel.connect()
            await ctx.send(f"🎀 หนูเข้าห้อง **{channel.name}** แล้วค่ะ~")
        
        queue = get_queue(ctx.guild.id)
        status_msg = await ctx.send("🔍 กำลังค้นหาเพลงค่ะ...")
        
        try:
            # Check if playlist
            is_playlist = 'list=' in query or 'playlist' in query.lower()
            
            if is_playlist:
                await status_msg.edit(content="📚 กำลังโหลด Playlist ค่ะ...")
                
                playlist_name, entries = await YTDLSource.extract_playlist(
                    query, loop=self.bot.loop, guild_id=ctx.guild.id
                )
                
                if playlist_name and entries:
                    added = 0
                    for entry in entries[:200]:
                        if not entry:
                            continue
                        
                        song_url = (
                            entry.get('url') or 
                            entry.get('webpage_url') or 
                            f"https://youtube.com/watch?v={entry.get('id')}"
                        )
                        
                        queue.append({
                            'url': song_url,
                            'title': entry.get('title', 'Unknown'),
                            'duration': entry.get('duration'),
                            'thumbnail': entry.get('thumbnail'),
                            'uploader': entry.get('uploader'),
                            'requester': ctx.author.name
                        })
                        added += 1
                    
                    await status_msg.delete()
                    
                    embed = discord.Embed(
                        title="📚 เพิ่ม Playlist เข้า Queue แล้วค่ะ~",
                        description=f"**{playlist_name}**\n\n🎵 เพิ่ม {added} เพลง",
                        color=0xFF69B4
                    )
                    embed.set_footer(text=f"ขอโดย: {ctx.author.name} 💕")
                    await ctx.send(embed=embed)
                    
                    if not (ctx.voice_client.is_playing() or ctx.voice_client.is_paused()):
                        await self.play_next(ctx)
                    return
                else:
                    is_playlist = False
            
            if not is_playlist:
                # Single track
                data = await YTDLSource.search(query, loop=self.bot.loop, guild_id=ctx.guild.id)
                
                if not data:
                    await status_msg.edit(content="❌ ไม่พบเพลงค่ะ 🥺")
                    return
                
                audio_url = data.get('url')
                duration = data.get('duration')
                abr = data.get('abr')
                acodec = data.get('acodec')
                
                await status_msg.delete()
                
                song_info = {
                    'url': data.get('webpage_url') or query,
                    'title': data.get('title', 'Unknown'),
                    'audio_url': audio_url,
                    'duration': duration,
                    'abr': abr,
                    'acodec': acodec,
                    'thumbnail': data.get('thumbnail'),
                    'uploader': data.get('uploader'),
                    'requester': ctx.author.name
                }
                
                if ctx.voice_client.is_playing() or ctx.voice_client.is_paused():
                    queue.append(song_info)
                    
                    duration_str = format_duration(duration)
                    quality_parts = []
                    if abr:
                        quality_parts.append(f"{int(abr)}kbps")
                    if acodec:
                        quality_parts.append(acodec.upper())
                    quality_str = " • ".join(quality_parts) if quality_parts else ""
                    
                    embed = discord.Embed(
                        title="📥 เพิ่มเข้า Queue แล้วค่ะ~",
                        description=f"**{data['title']}**",
                        color=0xFF69B4
                    )
                    info_str = f"⏱️ {duration_str}"
                    if quality_str:
                        info_str += f" • 🎧 {quality_str}"
                    embed.add_field(name="ℹ️ ข้อมูล", value=info_str, inline=False)
                    embed.set_footer(text=f"ตำแหน่ง #{len(queue)} | ขอโดย: {ctx.author.name}")
                    
                    if data.get('thumbnail'):
                        embed.set_thumbnail(url=data['thumbnail'])
                    
                    await ctx.send(embed=embed)
                else:
                    queue.append(song_info)
                    await self.play_next(ctx)
            
        except Exception as e:
            await status_msg.edit(content=f"❌ ไม่สามารถโหลดเพลงได้ค่ะ: {e} 🥺")

    @commands.command()
    async def pause(self, ctx):
        """หยุดเพลงชั่วคราว"""
        if ctx.voice_client and ctx.voice_client.is_playing():
            ctx.voice_client.pause()
            await ctx.send("⏸️ หยุดเพลงชั่วคราวค่ะ~ กด `!!resume` เพื่อเล่นต่อนะคะ 🎵")
        else:
            await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~")

    @commands.command()
    async def resume(self, ctx):
        """เล่นเพลงต่อ"""
        if ctx.voice_client and ctx.voice_client.is_paused():
            ctx.voice_client.resume()
            await ctx.send("▶️ เล่นเพลงต่อค่ะ~ 🎶")
        else:
            await ctx.send("❌ ไม่มีเพลงที่หยุดอยู่นะคะ~")

    @commands.command()
    async def skip(self, ctx):
        """ข้ามไปเพลงถัดไป"""
        if ctx.voice_client and (ctx.voice_client.is_playing() or ctx.voice_client.is_paused()):
            ctx.voice_client.stop()
            await ctx.send("⏭️ ข้ามไปเพลงถัดไปค่ะ~")
        else:
            await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~")

    @commands.command(name='queue', aliases=['q'])
    async def show_queue(self, ctx):
        """แสดง queue"""
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
                duration_str = format_duration(song.get('duration'))
                queue_list += f"`{i}.` {song['title']} [{duration_str}]\n"
            
            if len(queue) > 10:
                queue_list += f"\n... และอีก {len(queue) - 10} เพลงค่ะ"
            
            embed.add_field(name="📋 ถัดไป", value=queue_list, inline=False)
        
        embed.set_footer(text=f"ทั้งหมด {len(queue)} เพลงใน Queue ค่ะ 💕")
        await ctx.send(embed=embed, view=MusicControlView(ctx, get_queue, now_playing))

    @commands.command(name='np', aliases=['nowplaying'])
    async def now_playing_cmd(self, ctx):
        """แสดงเพลงที่กำลังเล่น"""
        current = now_playing.get(ctx.guild.id)
        
        if current:
            duration_str = format_duration(current.get('duration'))
            
            quality_parts = []
            if current.get('abr'):
                quality_parts.append(f"{int(current['abr'])}kbps")
            if current.get('acodec'):
                quality_parts.append(current['acodec'].upper())
            quality_str = " • ".join(quality_parts) if quality_parts else "Auto"
            
            embed = discord.Embed(title="🎶 กำลังเล่นอยู่ค่ะ~", color=0xFF69B4)
            embed.add_field(name="🎵 เพลง", value=f"**{current['title']}**", inline=False)
            embed.add_field(name="⏱️ ความยาว", value=duration_str, inline=True)
            embed.add_field(name="🎧 คุณภาพ", value=quality_str, inline=True)
            embed.add_field(name="📋 Queue", value=f"{len(get_queue(ctx.guild.id))} เพลง", inline=True)
            if current.get('uploader'):
                embed.add_field(name="👤 ช่อง", value=current['uploader'], inline=True)
            embed.add_field(name="👤 ขอโดย", value=current['requester'], inline=True)
            embed.set_footer(text="เพลงเพราะมากเลยค่ะ~ 💕")
            
            if current.get('thumbnail'):
                embed.set_thumbnail(url=current['thumbnail'])
            
            await ctx.send(embed=embed, view=MusicControlView(ctx, get_queue, now_playing))
        else:
            await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~ ขอเพลงได้เลยค่ะ! 🎵")

    @commands.command()
    async def clear(self, ctx):
        """ล้าง queue"""
        queue = get_queue(ctx.guild.id)
        queue.clear()
        await ctx.send("🗑️ ล้าง Queue เรียบร้อยแล้วค่ะ~ 💕")

    @commands.command()
    async def stop(self, ctx):
        """หยุดเพลงและออกจากห้อง"""
        if ctx.voice_client:
            queue = get_queue(ctx.guild.id)
            queue.clear()
            now_playing.pop(ctx.guild.id, None)
            await ctx.voice_client.disconnect()
            await ctx.send("👋 ลาก่อนนะคะ~ ไว้เรียกหนูมาเล่นเพลงอีกนะคะ! 🎀")

    @commands.command()
    async def volume(self, ctx, vol: int = None):
        """ปรับระดับเสียง (10-100)"""
        if not ctx.voice_client:
            await ctx.send("❌ หนูไม่ได้อยู่ในห้องเสียงค่ะ~")
            return
        
        if not ctx.voice_client.source:
            await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่ค่ะ~")
            return
        
        if vol is None:
            current_vol = int(ctx.voice_client.source.volume * 100)
            await ctx.send(f"🔊 ระดับเสียงปัจจุบัน: **{current_vol}%**")
            return
        
        if not 10 <= vol <= 100:
            await ctx.send("❌ ระดับเสียงต้องอยู่ระหว่าง 10-100 ค่ะ~")
            return
        
        ctx.voice_client.source.volume = vol / 100
        await ctx.send(f"🔊 ปรับระดับเสียงเป็น **{vol}%** แล้วค่ะ~")


async def setup(bot):
    await bot.add_cog(Music(bot))
