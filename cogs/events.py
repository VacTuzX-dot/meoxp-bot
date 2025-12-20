import discord
from discord.ext import commands
import wavelink
import asyncio
from typing import cast

from config import bot


# Auto-leave tracking
auto_leave_tasks = {}
auto_leave_pending = set()  # เก็บ guild_id ที่กำลังจะ auto-leave


class Events(commands.Cog):
    """Events cog - on_ready, on_voice_state_update"""
    
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_ready(self):
        print(f'Logged in as {self.bot.user} (ID: {self.bot.user.id})')
        print('------ System Online ------')
        await self.bot.change_presence(activity=discord.Activity(type=discord.ActivityType.listening, name="!!help 🎵"))

    @commands.Cog.listener()
    async def on_voice_state_update(self, member, before, after):
        """ออกจากห้องเสียงอัตโนมัติเมื่อไม่มีใครอยู่ในห้อง (cooldown 5 วินาที)"""
        global auto_leave_tasks, auto_leave_pending
        
        # ตรวจสอบว่ามีคนออกจากห้องหรือเปลี่ยนห้อง
        if before.channel is None:
            return
        
        # ข้ามถ้าเป็นบอทเอง
        if member.id == self.bot.user.id:
            return
        
        guild = before.channel.guild
        voice_client = guild.voice_client
        
        # ตรวจสอบว่าบอทอยู่ในห้องเสียงหรือไม่
        if voice_client is None:
            return
        
        # ตรวจสอบว่าบอทอยู่ในห้องเดียวกันหรือไม่
        if not hasattr(voice_client, 'channel') or voice_client.channel is None:
            return
        
        if before.channel.id != voice_client.channel.id:
            return
        
        # นับจำนวนคนในห้อง (ไม่รวมบอท)
        members_in_channel = [m for m in voice_client.channel.members if not m.bot]
        
        if len(members_in_channel) == 0:
            # ไม่มีใครอยู่ในห้อง - เริ่ม cooldown
            guild_id = guild.id
            
            # ยกเลิก task เก่าถ้ามี
            if guild_id in auto_leave_tasks:
                auto_leave_tasks[guild_id].cancel()
            
            async def leave_after_cooldown():
                try:
                    await asyncio.sleep(5)  # cooldown 5 วินาที
                    
                    # ตรวจสอบอีกครั้งว่ายังไม่มีใครอยู่
                    vc = guild.voice_client
                    if vc and hasattr(vc, 'channel') and vc.channel:
                        current_members = [m for m in vc.channel.members if not m.bot]
                        if len(current_members) == 0:
                            # ตั้ง flag ว่ากำลัง auto-leave
                            auto_leave_pending.add(guild_id)
                            
                            # ถ้าเป็น wavelink player
                            if isinstance(vc, wavelink.Player):
                                vc.queue.clear()
                            
                            await vc.disconnect()
                            
                            # ลบ flag หลัง disconnect
                            auto_leave_pending.discard(guild_id)
                            
                            print(f"🚪 Auto-left voice channel in guild {guild.name} (no members)")
                except asyncio.CancelledError:
                    pass  # Task ถูกยกเลิกเพราะมีคนเข้ามา
                finally:
                    auto_leave_tasks.pop(guild_id, None)
            
            auto_leave_tasks[guild_id] = asyncio.create_task(leave_after_cooldown())
        
        else:
            # มีคนอยู่ในห้อง - ยกเลิก auto-leave ถ้ามี
            guild_id = guild.id
            if guild_id in auto_leave_tasks:
                auto_leave_tasks[guild_id].cancel()
                auto_leave_tasks.pop(guild_id, None)


async def setup(bot):
    await bot.add_cog(Events(bot))
