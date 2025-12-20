import discord
from discord.ext import commands
import subprocess
import asyncio

from config import MY_OWNER_ID


class Admin(commands.Cog):
    """Admin commands cog - System & Message Management"""
    
    def __init__(self, bot):
        self.bot = bot

    @commands.command(name='cmd')
    async def shell_command(self, ctx, *, command):
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

    @commands.command(name='server', aliases=['status', 'sysinfo'])
    async def server_status(self, ctx):
        """แสดงสถานะ Server"""
        if ctx.author.id != MY_OWNER_ID:
            await ctx.send("⛔ ขอโทษนะคะ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ค่ะ 🙏")
            return
        
        status_msg = await ctx.send("🔄 กำลังเก็บข้อมูล Server...")
        
        try:
            # CPU Usage
            cpu_result = subprocess.run(
                "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1",
                shell=True, capture_output=True, text=True
            )
            cpu_usage = cpu_result.stdout.strip() or "N/A"
            
            # Memory Usage
            mem_result = subprocess.run(
                "free -m | awk 'NR==2{printf \"%.1f/%.1fGB (%.1f%%)\", $3/1024, $2/1024, $3*100/$2}'",
                shell=True, capture_output=True, text=True
            )
            mem_usage = mem_result.stdout.strip() or "N/A"
            
            # Disk Usage
            disk_result = subprocess.run(
                "df -h / | awk 'NR==2{printf \"%s/%s (%s)\", $3, $2, $5}'",
                shell=True, capture_output=True, text=True
            )
            disk_usage = disk_result.stdout.strip() or "N/A"
            
            # Uptime
            uptime_result = subprocess.run(
                "uptime -p",
                shell=True, capture_output=True, text=True
            )
            uptime = uptime_result.stdout.strip().replace("up ", "") or "N/A"
            
            # Load Average
            load_result = subprocess.run(
                "cat /proc/loadavg | awk '{print $1, $2, $3}'",
                shell=True, capture_output=True, text=True
            )
            load_avg = load_result.stdout.strip() or "N/A"
            
            # Docker Containers
            docker_result = subprocess.run(
                "docker ps --format '{{.Names}}: {{.Status}}' 2>/dev/null | head -10",
                shell=True, capture_output=True, text=True
            )
            docker_containers = docker_result.stdout.strip()
            if not docker_containers:
                docker_containers = "ไม่มี Container ที่รันอยู่"
            
            # Hostname
            hostname_result = subprocess.run("hostname", shell=True, capture_output=True, text=True)
            hostname = hostname_result.stdout.strip() or "Unknown"
            
            # OS Info
            os_result = subprocess.run(
                "cat /etc/os-release | grep PRETTY_NAME | cut -d'\"' -f2",
                shell=True, capture_output=True, text=True
            )
            os_info = os_result.stdout.strip() or "Debian"
            
            # Create Embed
            embed = discord.Embed(
                title=f"🖥️ Server Status: {hostname}",
                color=0x00FF00
            )
            embed.add_field(name="🐧 OS", value=os_info, inline=True)
            embed.add_field(name="⏱️ Uptime", value=uptime, inline=True)
            embed.add_field(name="📊 Load Avg", value=load_avg, inline=True)
            embed.add_field(name="💻 CPU", value=f"{cpu_usage}%", inline=True)
            embed.add_field(name="🧠 RAM", value=mem_usage, inline=True)
            embed.add_field(name="💾 Disk", value=disk_usage, inline=True)
            embed.add_field(name="🐳 Docker Containers", value=f"```{docker_containers}```", inline=False)
            embed.set_footer(text="🟢 Server Online")
            
            await status_msg.delete()
            await ctx.send(embed=embed)
            
        except Exception as e:
            await status_msg.edit(content=f"❌ เกิดข้อผิดพลาดค่ะ: {e}")

    @commands.command(name='purge', aliases=['clear_msg', 'del'])
    async def purge_messages(self, ctx, amount: int = None):
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
            # ลบข้อความคำสั่งก่อน
            await ctx.message.delete()
            
            total_deleted = 0
            remaining = amount
            batch_size = 100  # Discord limit per bulk delete
            
            # แสดงสถานะเริ่มต้น
            status_msg = await ctx.send(f"🗑️ กำลังลบ {amount} ข้อความ... (0/{amount})")
            
            while remaining > 0:
                current_batch = min(batch_size, remaining)
                
                try:
                    deleted = await ctx.channel.purge(limit=current_batch, bulk=True)
                    deleted_count = len(deleted)
                    
                    # ถ้าไม่มีข้อความให้ลบแล้ว
                    if deleted_count == 0:
                        break
                        
                    total_deleted += deleted_count
                    remaining -= deleted_count
                    
                    # อัปเดตสถานะ
                    try:
                        await status_msg.edit(content=f"🗑️ กำลังลบ... ({total_deleted}/{amount})")
                    except:
                        pass  # ข้อความสถานะอาจถูกลบไปแล้ว
                    
                    # Delay ระหว่าง batch เพื่อหลีก rate limit
                    if remaining > 0:
                        await asyncio.sleep(1.5)
                        
                except discord.NotFound:
                    # ข้อความถูกลบไปแล้ว ข้ามไป
                    continue
                except discord.HTTPException as e:
                    if '429' in str(e) or 'rate limit' in str(e).lower():
                        # Rate limited - รอแล้วลองใหม่
                        await asyncio.sleep(3)
                        continue
                    elif 'older than 14 days' in str(e):
                        break  # ไม่สามารถลบข้อความเก่าได้
                    else:
                        raise
            
            # ลบ status message และส่งยืนยัน
            try:
                await status_msg.delete()
            except:
                pass
                
            confirm_msg = await ctx.send(f"🗑️ ลบไป **{total_deleted}** ข้อความแล้วค่ะ~ ✨")
            await asyncio.sleep(3)
            await confirm_msg.delete()
            
        except discord.Forbidden:
            await ctx.send("❌ หนูไม่มีสิทธิ์ลบข้อความในช่องนี้ค่ะ 🥺")
        except discord.HTTPException as e:
            if 'older than 14 days' in str(e):
                await ctx.send("❌ ไม่สามารถ bulk delete ข้อความที่เก่ากว่า 14 วันได้ค่ะ~")
            else:
                await ctx.send(f"❌ เกิดข้อผิดพลาดค่ะ: {e}")


async def setup(bot):
    await bot.add_cog(Admin(bot))
