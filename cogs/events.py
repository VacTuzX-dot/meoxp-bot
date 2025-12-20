import discord
from discord.ext import commands
import asyncio

from config import bot


# Auto-leave tracking
auto_leave_tasks = {}
auto_leave_pending = set()


class Events(commands.Cog):
    """Events cog - on_ready, on_voice_state_update"""
    
    def __init__(self, bot):
        self.bot = bot

    @commands.Cog.listener()
    async def on_ready(self):
        print(f'Logged in as {self.bot.user} (ID: {self.bot.user.id})')
        print('------ System Online ------')
        await self.bot.change_presence(
            status=discord.Status.idle,
            activity=discord.Activity(
                type=discord.ActivityType.listening,
                name="!!help 🎵"
            )
        )

    @commands.Cog.listener()
    async def on_voice_state_update(self, member, before, after):
        """ออกจากห้องเสียงอัตโนมัติเมื่อไม่มีใคร (cooldown 5 วินาที)"""
        global auto_leave_tasks, auto_leave_pending
        
        if before.channel is None:
            return
        
        if member.id == self.bot.user.id:
            return
        
        guild = before.channel.guild
        voice_client = guild.voice_client
        
        if voice_client is None:
            return
        
        if not hasattr(voice_client, 'channel') or voice_client.channel is None:
            return
        
        if before.channel.id != voice_client.channel.id:
            return
        
        members_in_channel = [m for m in voice_client.channel.members if not m.bot]
        
        if len(members_in_channel) == 0:
            guild_id = guild.id
            
            if guild_id in auto_leave_tasks:
                auto_leave_tasks[guild_id].cancel()
            
            async def leave_after_cooldown():
                try:
                    await asyncio.sleep(5)
                    
                    vc = guild.voice_client
                    if vc and hasattr(vc, 'channel') and vc.channel:
                        current_members = [m for m in vc.channel.members if not m.bot]
                        if len(current_members) == 0:
                            auto_leave_pending.add(guild_id)
                            vc.stop()
                            await vc.disconnect()
                            auto_leave_pending.discard(guild_id)
                            print(f"🚪 Auto-left in {guild.name}")
                except asyncio.CancelledError:
                    pass
                finally:
                    auto_leave_tasks.pop(guild_id, None)
            
            auto_leave_tasks[guild_id] = asyncio.create_task(leave_after_cooldown())
        else:
            guild_id = guild.id
            if guild_id in auto_leave_tasks:
                auto_leave_tasks[guild_id].cancel()
                auto_leave_tasks.pop(guild_id, None)


async def setup(bot):
    await bot.add_cog(Events(bot))
