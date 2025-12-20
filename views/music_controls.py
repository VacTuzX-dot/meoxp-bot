import discord
from discord import ui
from typing import cast
import wavelink


class MusicControlView(ui.View):
    """ปุ่มควบคุมเพลงแบบ Interactive - wavelink version"""
    def __init__(self, ctx):
        super().__init__(timeout=300)  # 5 นาที
        self.ctx = ctx

    @ui.button(label="⏸️ หยุดชั่วคราว", style=discord.ButtonStyle.secondary)
    async def pause_button(self, interaction: discord.Interaction, button: ui.Button):
        player = cast(wavelink.Player, interaction.guild.voice_client)
        if player and player.playing and not player.paused:
            await player.pause(True)
            button.label = "▶️ เล่นต่อ"
            button.style = discord.ButtonStyle.success
            await interaction.response.edit_message(view=self)
            await interaction.followup.send("⏸️ หยุดเพลงชั่วคราวค่ะ", ephemeral=True)
        elif player and player.paused:
            await player.pause(False)
            button.label = "⏸️ หยุดชั่วคราว"
            button.style = discord.ButtonStyle.secondary
            await interaction.response.edit_message(view=self)
            await interaction.followup.send("▶️ เล่นเพลงต่อค่ะ", ephemeral=True)
        else:
            await interaction.response.send_message("❌ ไม่มีเพลงที่กำลังเล่นอยู่นะคะ", ephemeral=True)

    @ui.button(label="⏭️ ข้าม", style=discord.ButtonStyle.primary)
    async def skip_button(self, interaction: discord.Interaction, button: ui.Button):
        player = cast(wavelink.Player, interaction.guild.voice_client)
        if player and player.playing:
            await player.skip()
            await interaction.response.send_message("⏭️ ข้ามไปเพลงถัดไปค่ะ~", ephemeral=True)
        else:
            await interaction.response.send_message("❌ ไม่มีเพลงที่จะข้ามนะคะ", ephemeral=True)

    @ui.button(label="📋 ดู Queue", style=discord.ButtonStyle.secondary)
    async def queue_button(self, interaction: discord.Interaction, button: ui.Button):
        player = cast(wavelink.Player, interaction.guild.voice_client)
        
        if not player or (not player.playing and player.queue.is_empty):
            await interaction.response.send_message("📭 Queue ว่างเปล่าค่ะ", ephemeral=True)
            return
        
        embed = discord.Embed(title="🎵 รายการเพลง", color=0xFF69B4)
        
        if player.current:
            embed.add_field(
                name="🎶 กำลังเล่น",
                value=f"**{player.current.title}**",
                inline=False
            )
        
        if not player.queue.is_empty:
            queue_list = ""
            for i, track in enumerate(list(player.queue)[:5], 1):
                queue_list += f"`{i}.` {track.title}\n"
            if len(player.queue) > 5:
                queue_list += f"\n... และอีก {len(player.queue) - 5} เพลงค่ะ"
            embed.add_field(name="📋 ถัดไป", value=queue_list, inline=False)
        
        await interaction.response.send_message(embed=embed, ephemeral=True)

    @ui.button(label="🗑️ ล้าง Queue", style=discord.ButtonStyle.danger)
    async def clear_button(self, interaction: discord.Interaction, button: ui.Button):
        player = cast(wavelink.Player, interaction.guild.voice_client)
        if player:
            player.queue.clear()
            await interaction.response.send_message("🗑️ ล้าง Queue เรียบร้อยแล้วค่ะ~", ephemeral=True)
        else:
            await interaction.response.send_message("❌ ไม่มี Queue ค่ะ", ephemeral=True)

    @ui.button(label="👋 ออกจากห้อง", style=discord.ButtonStyle.danger)
    async def stop_button(self, interaction: discord.Interaction, button: ui.Button):
        player = cast(wavelink.Player, interaction.guild.voice_client)
        if player:
            player.queue.clear()
            await player.disconnect()
            await interaction.response.send_message("👋 ลาก่อนนะคะ~ ไว้เรียกหนูมาเล่นเพลงอีกนะคะ!", ephemeral=True)
            self.stop()
        else:
            await interaction.response.send_message("❌ หนูไม่ได้อยู่ในห้องเสียงค่ะ", ephemeral=True)
