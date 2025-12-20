import discord
from discord.ext import commands
import wavelink
import asyncio
from typing import cast

from config import bot, LAVALINK_HOST, LAVALINK_PORT, LAVALINK_PASSWORD
from views.music_controls import MusicControlView


# Track request info (เก็บว่าใครขอเพลง)
track_requesters = {}


def format_duration(milliseconds):
    """แปลง milliseconds เป็น MM:SS หรือ HH:MM:SS"""
    if not milliseconds:
        return "Unknown"
    seconds = int(milliseconds / 1000)
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


class Music(commands.Cog):
    """Music commands cog - using Lavalink + wavelink"""
    
    def __init__(self, bot):
        self.bot = bot
    
    async def cog_load(self):
        """เชื่อมต่อ Lavalink เมื่อ cog โหลด"""
        # รอ bot พร้อมก่อน
        await self.bot.wait_until_ready()
        
        # สร้าง Lavalink node
        node = wavelink.Node(
            uri=f"http://{LAVALINK_HOST}:{LAVALINK_PORT}",
            password=LAVALINK_PASSWORD,
        )
        
        # เชื่อมต่อ
        await wavelink.Pool.connect(nodes=[node], client=self.bot, cache_capacity=100)
        print(f"✅ Connected to Lavalink at {LAVALINK_HOST}:{LAVALINK_PORT}")
    
    @commands.Cog.listener()
    async def on_wavelink_node_ready(self, payload: wavelink.NodeReadyEventPayload):
        """Lavalink node พร้อมใช้งาน"""
        print(f"🎵 Lavalink Node '{payload.node.identifier}' is ready!")
    
    @commands.Cog.listener()
    async def on_wavelink_track_start(self, payload: wavelink.TrackStartEventPayload):
        """เพลงเริ่มเล่น"""
        player = payload.player
        track = payload.track
        
        if not player or not player.guild:
            return
        
        # หา channel ที่จะส่งข้อความ
        channel = player.guild.get_channel(player.channel.id) if hasattr(player, 'text_channel_id') else None
        if not channel and hasattr(player, 'ctx'):
            channel = player.ctx.channel
        
        if channel:
            # สร้าง embed
            duration_str = format_duration(track.length)
            
            # ดึงข้อมูลคุณภาพ
            quality_str = "Lavalink"
            if hasattr(track, 'source'):
                quality_str = track.source.capitalize()
            
            requester = track_requesters.get(track.identifier, "Unknown")
            
            embed = discord.Embed(
                title="🎶 กำลังเล่นเพลงค่ะ~",
                description=f"**{track.title}**",
                color=0xFF69B4
            )
            embed.add_field(name="⏱️ ความยาว", value=duration_str, inline=True)
            embed.add_field(name="🎧 Source", value=quality_str, inline=True)
            embed.add_field(name="📋 Queue", value=f"{len(player.queue)} เพลง", inline=True)
            if track.author:
                embed.add_field(name="👤 ศิลปิน", value=track.author, inline=True)
            embed.set_footer(text=f"ขอโดย: {requester} 💕")
            
            if track.artwork:
                embed.set_thumbnail(url=track.artwork)
            
            await channel.send(embed=embed)
    
    @commands.Cog.listener()
    async def on_wavelink_track_end(self, payload: wavelink.TrackEndEventPayload):
        """เพลงจบ - เช็คว่า queue หมดหรือยัง"""
        player = payload.player
        
        if not player:
            return
        
        # ถ้า queue หมดแล้ว
        if player.queue.is_empty and not player.playing:
            # Import here to avoid circular import
            from cogs.events import auto_leave_pending
            
            if player.guild.id not in auto_leave_pending:
                if hasattr(player, 'ctx'):
                    await player.ctx.send("📭 เพลงใน Queue หมดแล้วค่ะ~ ขอเพลงใหม่ได้เลยนะคะ 🎵")

    @commands.command()
    async def play(self, ctx, *, query: str):
        """เล่นเพลงหรือเพิ่มเข้า queue"""
        if not ctx.author.voice:
            await ctx.send("❌ คุณต้องเข้าห้องเสียงก่อนนะคะ~ 🎤")
            return

        channel = ctx.author.voice.channel
        
        # เชื่อม voice channel
        player = cast(wavelink.Player, ctx.voice_client)
        if not player:
            player = await channel.connect(cls=wavelink.Player)
            player.ctx = ctx  # เก็บ context สำหรับส่งข้อความ
            await ctx.send(f"🎀 หนูเข้าห้อง **{channel.name}** แล้วค่ะ~")
        
        # ตั้งค่า auto-play
        player.autoplay = wavelink.AutoPlayMode.partial
        
        # ค้นหาเพลง
        status_msg = await ctx.send("🔍 กำลังค้นหาเพลงค่ะ...")
        
        try:
            # ตรวจสอบว่าเป็น URL หรือ search
            if not query.startswith('http'):
                query = f"ytsearch:{query}"
            
            tracks = await wavelink.Playable.search(query)
            
            if not tracks:
                await status_msg.edit(content="❌ ไม่พบเพลงค่ะ 🥺")
                return
            
            # ถ้าเป็น playlist
            if isinstance(tracks, wavelink.Playlist):
                added = 0
                for track in tracks.tracks[:200]:  # limit 200
                    track_requesters[track.identifier] = ctx.author.name
                    await player.queue.put_wait(track)
                    added += 1
                
                await status_msg.delete()
                
                embed = discord.Embed(
                    title="📚 เพิ่ม Playlist เข้า Queue แล้วค่ะ~",
                    description=f"**{tracks.name}**\n\n🎵 เพิ่ม {added} เพลงเข้า Queue",
                    color=0xFF69B4
                )
                embed.set_footer(text=f"ขอโดย: {ctx.author.name} 💕")
                await ctx.send(embed=embed)
            else:
                # เพลงเดี่ยว
                track = tracks[0]
                track_requesters[track.identifier] = ctx.author.name
                
                await status_msg.delete()
                
                if player.playing:
                    await player.queue.put_wait(track)
                    
                    embed = discord.Embed(
                        title="📥 เพิ่มเข้า Queue แล้วค่ะ~",
                        description=f"**{track.title}**",
                        color=0xFF69B4
                    )
                    embed.add_field(name="⏱️ ความยาว", value=format_duration(track.length), inline=True)
                    embed.add_field(name="📋 ตำแหน่ง", value=f"#{len(player.queue)}", inline=True)
                    embed.set_footer(text=f"ขอโดย: {ctx.author.name} 💕")
                    if track.artwork:
                        embed.set_thumbnail(url=track.artwork)
                    await ctx.send(embed=embed)
                else:
                    await player.queue.put_wait(track)
            
            # เริ่มเล่นถ้ายังไม่เล่น
            if not player.playing:
                await player.play(player.queue.get())
            
        except Exception as e:
            await status_msg.edit(content=f"❌ เกิดข้อผิดพลาดค่ะ: {e} 🥺")

    @commands.command()
    async def pause(self, ctx):
        """หยุดเพลงชั่วคราว"""
        player = cast(wavelink.Player, ctx.voice_client)
        if player and player.playing:
            await player.pause(True)
            await ctx.send("⏸️ หยุดเพลงชั่วคราวค่ะ~ กด `!!resume` เพื่อเล่นต่อนะคะ 🎵")
        else:
            await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~")

    @commands.command()
    async def resume(self, ctx):
        """เล่นเพลงต่อ"""
        player = cast(wavelink.Player, ctx.voice_client)
        if player and player.paused:
            await player.pause(False)
            await ctx.send("▶️ เล่นเพลงต่อค่ะ~ 🎶")
        else:
            await ctx.send("❌ ไม่มีเพลงที่หยุดอยู่นะคะ~")

    @commands.command()
    async def skip(self, ctx):
        """ข้ามไปเพลงถัดไป"""
        player = cast(wavelink.Player, ctx.voice_client)
        if player and player.playing:
            await player.skip()
            await ctx.send("⏭️ ข้ามไปเพลงถัดไปค่ะ~")
        else:
            await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~")

    @commands.command(name='queue', aliases=['q'])
    async def show_queue(self, ctx):
        """แสดง queue"""
        player = cast(wavelink.Player, ctx.voice_client)
        
        if not player or (not player.playing and player.queue.is_empty):
            await ctx.send("📭 Queue ว่างเปล่าค่ะ~ ขอเพลงได้เลยนะคะ! 🎵")
            return
        
        embed = discord.Embed(title="🎵 รายการเพลง", color=0xFF69B4)
        
        # กำลังเล่น
        if player.current:
            current = player.current
            requester = track_requesters.get(current.identifier, "Unknown")
            embed.add_field(
                name="🎶 กำลังเล่น",
                value=f"**{current.title}**\nขอโดย: {requester}",
                inline=False
            )
        
        # Queue
        if not player.queue.is_empty:
            queue_list = ""
            for i, track in enumerate(list(player.queue)[:10], 1):
                requester = track_requesters.get(track.identifier, "Unknown")
                queue_list += f"`{i}.` {track.title} - {requester}\n"
            
            if len(player.queue) > 10:
                queue_list += f"\n... และอีก {len(player.queue) - 10} เพลงค่ะ"
            
            embed.add_field(name="📋 ถัดไป", value=queue_list, inline=False)
        
        embed.set_footer(text=f"ทั้งหมด {len(player.queue)} เพลงใน Queue ค่ะ 💕")
        await ctx.send(embed=embed)

    @commands.command(name='np', aliases=['nowplaying'])
    async def now_playing(self, ctx):
        """แสดงเพลงที่กำลังเล่น"""
        player = cast(wavelink.Player, ctx.voice_client)
        
        if not player or not player.current:
            await ctx.send("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ~ ขอเพลงได้เลยค่ะ! 🎵")
            return
        
        track = player.current
        duration_str = format_duration(track.length)
        position_str = format_duration(player.position)
        
        requester = track_requesters.get(track.identifier, "Unknown")
        
        embed = discord.Embed(title="🎶 กำลังเล่นอยู่ค่ะ~", color=0xFF69B4)
        embed.add_field(name="🎵 เพลง", value=f"**{track.title}**", inline=False)
        embed.add_field(name="⏱️ ความยาว", value=f"{position_str} / {duration_str}", inline=True)
        embed.add_field(name="🎧 Source", value=track.source.capitalize() if hasattr(track, 'source') else "YouTube", inline=True)
        embed.add_field(name="📋 Queue", value=f"{len(player.queue)} เพลง", inline=True)
        if track.author:
            embed.add_field(name="👤 ศิลปิน", value=track.author, inline=True)
        embed.add_field(name="👤 ขอโดย", value=requester, inline=True)
        embed.set_footer(text="เพลงเพราะมากเลยค่ะ~ 💕")
        
        if track.artwork:
            embed.set_thumbnail(url=track.artwork)
        
        await ctx.send(embed=embed)

    @commands.command()
    async def clear(self, ctx):
        """ล้าง queue"""
        player = cast(wavelink.Player, ctx.voice_client)
        if player:
            player.queue.clear()
            await ctx.send("🗑️ ล้าง Queue เรียบร้อยแล้วค่ะ~ 💕")
        else:
            await ctx.send("❌ ไม่มี Queue ที่จะล้างค่ะ~")

    @commands.command()
    async def stop(self, ctx):
        """หยุดเพลงและออกจากห้อง"""
        player = cast(wavelink.Player, ctx.voice_client)
        if player:
            player.queue.clear()
            await player.disconnect()
            await ctx.send("👋 ลาก่อนนะคะ~ ไว้เรียกหนูมาเล่นเพลงอีกนะคะ! 🎀")
        else:
            await ctx.send("❌ หนูไม่ได้อยู่ในห้องเสียงค่ะ~")

    @commands.command()
    async def volume(self, ctx, vol: int = None):
        """ปรับเสียง (0-100)"""
        player = cast(wavelink.Player, ctx.voice_client)
        if not player:
            await ctx.send("❌ หนูไม่ได้อยู่ในห้องเสียงค่ะ~")
            return
        
        if vol is None:
            await ctx.send(f"🔊 ระดับเสียงปัจจุบัน: **{player.volume}%**")
            return
        
        if not 0 <= vol <= 100:
            await ctx.send("❌ ระดับเสียงต้องอยู่ระหว่าง 0-100 ค่ะ~")
            return
        
        await player.set_volume(vol)
        await ctx.send(f"🔊 ปรับระดับเสียงเป็น **{vol}%** แล้วค่ะ~")


async def setup(bot):
    await bot.add_cog(Music(bot))
