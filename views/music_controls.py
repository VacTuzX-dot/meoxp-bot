import discord
from discord import ui


class MusicControlView(ui.View):
    """ปุ่มควบคุมเพลงแบบ Interactive"""
    
    def __init__(self, ctx, get_queue_func, now_playing_dict):
        super().__init__(timeout=300)
        self.ctx = ctx
        self.get_queue = get_queue_func
        self.now_playing = now_playing_dict

    @ui.button(label="⏸️ หยุดชั่วคราว", style=discord.ButtonStyle.secondary)
    async def pause_button(self, interaction: discord.Interaction, button: ui.Button):
        vc = interaction.guild.voice_client
        if vc and vc.is_playing():
            vc.pause()
            button.label = "▶️ เล่นต่อ"
            button.style = discord.ButtonStyle.success
            await interaction.response.edit_message(view=self)
            await interaction.followup.send("⏸️ หยุดเพลงชั่วคราวค่ะ", ephemeral=True)
        elif vc and vc.is_paused():
            vc.resume()
            button.label = "⏸️ หยุดชั่วคราว"
            button.style = discord.ButtonStyle.secondary
            await interaction.response.edit_message(view=self)
            await interaction.followup.send("▶️ เล่นเพลงต่อค่ะ", ephemeral=True)
        else:
            await interaction.response.send_message("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ", ephemeral=True)

    @ui.button(label="⏭️ ข้าม", style=discord.ButtonStyle.primary)
    async def skip_button(self, interaction: discord.Interaction, button: ui.Button):
        vc = interaction.guild.voice_client
        if vc and (vc.is_playing() or vc.is_paused()):
            vc.stop()
            await interaction.response.send_message("⏭️ ข้ามไปเพลงถัดไปค่ะ~", ephemeral=True)
        else:
            await interaction.response.send_message("❌ ไม่มีเพลงที่จะข้ามนะคะ", ephemeral=True)

    @ui.button(label="📋 ดู Queue", style=discord.ButtonStyle.secondary)
    async def queue_button(self, interaction: discord.Interaction, button: ui.Button):
        queue = self.get_queue(interaction.guild.id)
        current = self.now_playing.get(interaction.guild.id)
        
        if not current and len(queue) == 0:
            await interaction.response.send_message("📭 Queue ว่างเปล่าค่ะ", ephemeral=True)
            return
        
        embed = discord.Embed(title="🎵 รายการเพลง", color=0xFF69B4)
        
        if current:
            embed.add_field(
                name="🎶 กำลังเล่น",
                value=f"**{current['title']}**",
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
        queue = self.get_queue(interaction.guild.id)
        queue.clear()
        await interaction.response.send_message("🗑️ ล้าง Queue เรียบร้อยแล้วค่ะ~", ephemeral=True)

    @ui.button(label="👋 ออกจากห้อง", style=discord.ButtonStyle.danger)
    async def stop_button(self, interaction: discord.Interaction, button: ui.Button):
        vc = interaction.guild.voice_client
        if vc:
            queue = self.get_queue(interaction.guild.id)
            queue.clear()
            self.now_playing.pop(interaction.guild.id, None)
            await vc.disconnect()
            await interaction.response.send_message("👋 ลาก่อนนะคะ~ ไว้เรียกหนูมาเล่นเพลงอีกนะคะ!", ephemeral=True)
            self.stop()
        else:
            await interaction.response.send_message("❌ หนูไม่ได้อยู่ในห้องเสียงค่ะ", ephemeral=True)
