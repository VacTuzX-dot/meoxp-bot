import discord
from discord.ext import commands
import os
import tempfile
import asyncio
from gtts import gTTS
from collections import deque

from config import MY_OWNER_ID
from utils.tts_cache import (
    TTS_VOICES, TTS_CACHE_DIR, TTS_CACHE_MAX_AGE_HOURS,
    get_cached_tts, save_to_cache, cleanup_tts_cache, get_cache_stats
)
import glob


# TTS Queue เพื่อให้ TTS ไม่ขัดกับเพลง
tts_queue = {}


def get_tts_queue(guild_id):
    if guild_id not in tts_queue:
        tts_queue[guild_id] = deque()
    return tts_queue[guild_id]


class TTS(commands.Cog):
    """Text-to-Speech commands cog"""
    
    def __init__(self, bot):
        self.bot = bot
    
    async def speak_tts(self, ctx, text: str, lang: str):
        """แปลงข้อความเป็นเสียงและเล่นใน Voice Channel (พร้อม Cache) - ใช้ Google TTS"""
        if not ctx.author.voice:
            await ctx.send("❌ คุณต้องเข้าห้องเสียงก่อนนะคะ~ 🎤")
            return
        
        channel = ctx.author.voice.channel
        
        # เชื่อมต่อ Voice Channel ถ้ายังไม่ได้เชื่อม
        if ctx.voice_client is None:
            await channel.connect()
            await ctx.send(f"🎀 หนูเข้าห้อง **{channel.name}** แล้วค่ะ~")
        
        audio_path = None
        from_cache = False
        
        try:
            # ตรวจสอบ cache ก่อน
            cached_path = get_cached_tts(text, lang)
            
            if cached_path:
                # ใช้จาก cache (เร็วมาก!)
                audio_path = cached_path
                from_cache = True
            else:
                # สร้างใหม่
                status_msg = await ctx.send("🗣️ กำลังสร้างเสียงค่ะ...")
                
                # สร้างไฟล์ชั่วคราว
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
                temp_path = temp_file.name
                temp_file.close()
                
                # ใช้ Google TTS สร้างไฟล์เสียง
                tts = gTTS(text=text, lang=lang)
                tts.save(temp_path)
                
                # บันทึกลง cache
                audio_path = save_to_cache(text, lang, temp_path)
                
                # ลบ temp file ถ้า cache สำเร็จ
                if audio_path != temp_path:
                    try:
                        os.unlink(temp_path)
                    except:
                        pass
                
                await status_msg.delete()
                
                # ล้าง cache เก่า (ทำเป็น background)
                cleanup_tts_cache()
            
            # ถ้ากำลังเล่นเพลงอยู่ ให้หยุดชั่วคราว
            was_playing = ctx.voice_client.is_playing()
            
            if was_playing:
                ctx.voice_client.pause()
            
            # รอให้เพลงหยุดก่อน
            while ctx.voice_client.is_playing():
                await asyncio.sleep(0.1)
            
            # เล่น TTS
            def after_tts(error):
                if error:
                    print(f'TTS error: {error}')
                # Resume เพลงถ้าหยุดไว้
                if was_playing and ctx.voice_client and not ctx.voice_client.is_playing():
                    ctx.voice_client.resume()
            
            source = discord.FFmpegPCMAudio(audio_path)
            ctx.voice_client.play(source, after=after_tts)
            
            # ส่งข้อความยืนยัน
            lang_name = "🇹🇭 ไทย" if lang == TTS_VOICES['th'] else "🇺🇸 อังกฤษ"
            cache_status = "⚡ จาก Cache" if from_cache else "🆕 สร้างใหม่ (Google TTS)"
            
            embed = discord.Embed(
                title="🗣️ กำลังพูดค่ะ~",
                description=f"**\"{text}\"**",
                color=0x00D4FF
            )
            embed.add_field(name="🌐 ภาษา", value=lang_name, inline=True)
            embed.add_field(name="💾 สถานะ", value=cache_status, inline=True)
            embed.set_footer(text=f"ขอโดย: {ctx.author.name} 💕")
            await ctx.send(embed=embed)
            
        except Exception as e:
            await ctx.send(f"❌ เกิดข้อผิดพลาดค่ะ: {e}")

    @commands.command(name='say', aliases=['tts', 'พูด'])
    async def tts_thai(self, ctx, *, text: str):
        """พูดข้อความเป็นภาษาไทย"""
        await self.speak_tts(ctx, text, TTS_VOICES['th'])

    @commands.command(name='saye', aliases=['ttse', 'speak'])
    async def tts_english(self, ctx, *, text: str):
        """พูดข้อความเป็นภาษาอังกฤษ"""
        await self.speak_tts(ctx, text, TTS_VOICES['en'])

    @commands.command(name='voices')
    async def list_voices(self, ctx):
        """แสดงรายการเสียง TTS ที่ใช้ได้"""
        embed = discord.Embed(
            title="🗣️ เสียง TTS ที่ใช้ได้",
            description="หนูพูดได้ทั้งภาษาไทยและอังกฤษค่ะ~",
            color=0x00D4FF
        )
        embed.add_field(
            name="🇹🇭 ภาษาไทย",
            value=f"**!!say** `<ข้อความ>`\nเสียง: Google TTS",
            inline=False
        )
        embed.add_field(
            name="🇺🇸 ภาษาอังกฤษ",
            value=f"**!!saye** `<ข้อความ>`\nเสียง: Google TTS",
            inline=False
        )
        embed.set_footer(text="ลองใช้ได้เลยนะคะ~ 💕")
        await ctx.send(embed=embed)

    @commands.command(name='ttscache', aliases=['cachestats'])
    async def tts_cache_stats(self, ctx):
        """ดูสถิติ TTS Cache"""
        stats = get_cache_stats()
        
        embed = discord.Embed(
            title="💾 สถิติ TTS Cache",
            color=0x00D4FF
        )
        embed.add_field(name="📁 จำนวนไฟล์", value=f"{stats['count']} ไฟล์", inline=True)
        embed.add_field(name="💿 ขนาดใช้งาน", value=f"{stats['size_mb']} MB", inline=True)
        embed.add_field(name="📦 ขนาดสูงสุด", value=f"{stats['max_size_mb']} MB", inline=True)
        embed.add_field(name="⏰ อายุ Cache", value=f"{TTS_CACHE_MAX_AGE_HOURS} ชั่วโมง", inline=True)
        embed.set_footer(text="cache ช่วยให้พูดซ้ำเร็วขึ้น ⚡")
        await ctx.send(embed=embed)

    @commands.command(name='clearcache', aliases=['ttsclear'])
    async def clear_tts_cache(self, ctx):
        """ล้าง TTS Cache ทั้งหมด"""
        if ctx.author.id != MY_OWNER_ID:
            await ctx.send("⛔ ขอโทษนะคะ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ค่ะ 🙏")
            return
        
        try:
            cache_files = glob.glob(os.path.join(TTS_CACHE_DIR, '*.mp3'))
            deleted_count = 0
            freed_size = 0
            
            for filepath in cache_files:
                try:
                    freed_size += os.path.getsize(filepath)
                    os.unlink(filepath)
                    deleted_count += 1
                except:
                    pass
            
            freed_mb = round(freed_size / (1024 * 1024), 2)
            
            embed = discord.Embed(
                title="🗑️ ล้าง TTS Cache เรียบร้อย",
                description=f"ลบไป **{deleted_count}** ไฟล์\nคืนพื้นที่ **{freed_mb} MB**",
                color=0x00FF00
            )
            await ctx.send(embed=embed)
            
        except Exception as e:
            await ctx.send(f"❌ เกิดข้อผิดพลาดค่ะ: {e}")


async def setup(bot):
    await bot.add_cog(TTS(bot))
