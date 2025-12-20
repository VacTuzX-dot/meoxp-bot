import discord
from discord.ext import commands
import os

from config import MY_OWNER_ID, bot
from views.help_menu import HelpView


class Utility(commands.Cog):
    """Utility commands cog - File Transfer & DM"""
    
    def __init__(self, bot):
        self.bot = bot

    @commands.command(name='help', aliases=['h', 'commands'])
    async def help_command(self, ctx):
        """แสดงเมนูช่วยเหลือ"""
        view = HelpView()
        await ctx.send(embed=view.get_embed(), view=view)

    @commands.command()
    async def getfile(self, ctx, filename):
        if os.path.exists(filename):
            await ctx.send("📎 นี่ค่ะ ไฟล์ที่ขอมาค่ะ~", file=discord.File(filename))
        else:
            await ctx.send(f"❌ ขอโทษนะคะ หาไฟล์ `{filename}` ไม่เจอค่ะ 🥺")

    @commands.command(name='sendtext')
    async def send_text_to(self, ctx, target: str, *, message: str):
        if ctx.author.id != MY_OWNER_ID:
            await ctx.send("⛔ ขอโทษนะคะ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ค่ะ 🙏")
            return
        
        try:
            destination = None
            target_type = None
            
            if target.startswith('<@') and target.endswith('>'):
                user_id = target.replace('<@', '').replace('!', '').replace('>', '')
                destination = await self.bot.fetch_user(int(user_id))
                target_type = "user"
            
            elif target.startswith('<#') and target.endswith('>'):
                channel_id = target.replace('<#', '').replace('>', '')
                destination = self.bot.get_channel(int(channel_id))
                target_type = "channel"
            
            elif target.isdigit():
                target_id = int(target)
                destination = self.bot.get_channel(target_id)
                target_type = "channel"
                
                if destination is None:
                    destination = await self.bot.fetch_user(target_id)
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


async def setup(bot):
    await bot.add_cog(Utility(bot))
