import discord
from discord import ui


class HelpView(ui.View):
    """เมนู Help แบบ Interactive พร้อมปุ่ม Back/Forward"""
    
    # หน้าต่างๆ ของ Help
    PAGES = [
        {
            "title": "🌸 สวัสดีค่ะ! หนูชื่อ Meo ค่ะ~",
            "description": "หนูเป็นบอทเล่นเพลงและช่วยเหลือต่างๆ ค่ะ\n\nกดปุ่ม ◀️ ▶️ เพื่อดูหน้าอื่นๆ นะคะ 💕",
            "fields": [
                ("🎵 เพลง", "เล่นเพลงจาก YouTube และอื่นๆ"),
                ("🗣️ TTS", "ให้หนูพูดข้อความใน Voice Channel"),
                ("💬 ส่งข้อความ", "ส่งข้อความไปยัง User/Channel"),
                ("⚙️ ระบบ", "คำสั่งสำหรับ Owner"),
            ]
        },
        {
            "title": "🎵 คำสั่งเพลง",
            "description": "คำสั่งเกี่ยวกับการเล่นเพลงค่ะ~",
            "fields": [
                ("!!play <ลิงก์/ชื่อเพลง>", "เล่นเพลงหรือเพิ่มเข้า Queue ค่ะ"),
                ("!!pause", "หยุดเพลงชั่วคราวค่ะ"),
                ("!!resume", "เล่นเพลงต่อค่ะ"),
                ("!!skip", "ข้ามไปเพลงถัดไปค่ะ"),
                ("!!queue หรือ !!q", "ดูรายการเพลงใน Queue ค่ะ"),
                ("!!np", "ดูเพลงที่กำลังเล่นค่ะ"),
                ("!!clear", "ล้าง Queue ค่ะ"),
                ("!!stop", "หยุดเพลงและออกจากห้องค่ะ"),
            ]
        },
        {
            "title": "🗣️ คำสั่ง Text-to-Speech",
            "description": "ให้หนูพูดข้อความเป็นเสียงใน Voice Channel ค่ะ~",
            "fields": [
                ("!!say <ข้อความ>", "พูดเป็นภาษาไทย 🇹🇭"),
                ("!!saye <ข้อความ>", "พูดเป็นภาษาอังกฤษ 🇺🇸"),
                ("!!voices", "ดูรายการเสียงที่ใช้ได้ค่ะ"),
            ]
        },
        {
            "title": "💬 คำสั่งส่งข้อความ",
            "description": "คำสั่งเกี่ยวกับการส่งข้อความค่ะ~",
            "fields": [
                ("!!sendtext <@user/#channel> <ข้อความ>", "ส่งข้อความไปยัง user หรือ channel ค่ะ (Owner only)"),
                ("!!getfile <ชื่อไฟล์>", "ดึงไฟล์จาก server ค่ะ"),
            ]
        },
        {
            "title": "⚙️ คำสั่งระบบ",
            "description": "คำสั่งสำหรับ Owner เท่านั้นนะคะ~",
            "fields": [
                ("!!cmd <คำสั่ง>", "รันคำสั่ง Shell บน Server ค่ะ"),
                ("!!server", "ดูสถานะ Server ค่ะ"),
                ("!!purge <จำนวน>", "ลบข้อความแบบไม่ถูก log (1-1000) ค่ะ"),
                ("!!help", "แสดงเมนูช่วยเหลือนี้ค่ะ"),
            ]
        },
    ]
    
    def __init__(self):
        super().__init__(timeout=180)
        self.current_page = 0
        self.update_buttons()
    
    def get_embed(self):
        """สร้าง Embed สำหรับหน้าปัจจุบัน"""
        page = self.PAGES[self.current_page]
        embed = discord.Embed(
            title=page["title"],
            description=page["description"],
            color=0xFF69B4
        )
        for name, value in page["fields"]:
            embed.add_field(name=name, value=value, inline=False)
        embed.set_footer(text=f"หน้า {self.current_page + 1}/{len(self.PAGES)} | หนูพร้อมช่วยเสมอค่ะ~ 🎀")
        return embed
    
    def update_buttons(self):
        """อัพเดทสถานะปุ่ม Back/Forward"""
        self.back_button.disabled = self.current_page == 0
        self.forward_button.disabled = self.current_page == len(self.PAGES) - 1
    
    @ui.button(label="◀️ ย้อนกลับ", style=discord.ButtonStyle.secondary, row=0)
    async def back_button(self, interaction: discord.Interaction, button: ui.Button):
        if self.current_page > 0:
            self.current_page -= 1
            self.update_buttons()
            await interaction.response.edit_message(embed=self.get_embed(), view=self)
    
    @ui.button(label="🏠 หน้าแรก", style=discord.ButtonStyle.primary, row=0)
    async def home_button(self, interaction: discord.Interaction, button: ui.Button):
        self.current_page = 0
        self.update_buttons()
        await interaction.response.edit_message(embed=self.get_embed(), view=self)
    
    @ui.button(label="▶️ ถัดไป", style=discord.ButtonStyle.secondary, row=0)
    async def forward_button(self, interaction: discord.Interaction, button: ui.Button):
        if self.current_page < len(self.PAGES) - 1:
            self.current_page += 1
            self.update_buttons()
            await interaction.response.edit_message(embed=self.get_embed(), view=self)
    
    @ui.button(label="🎵 เพลง", style=discord.ButtonStyle.success, row=1)
    async def music_page(self, interaction: discord.Interaction, button: ui.Button):
        self.current_page = 1
        self.update_buttons()
        await interaction.response.edit_message(embed=self.get_embed(), view=self)
    
    @ui.button(label="🗣️ TTS", style=discord.ButtonStyle.success, row=1)
    async def tts_page(self, interaction: discord.Interaction, button: ui.Button):
        self.current_page = 2
        self.update_buttons()
        await interaction.response.edit_message(embed=self.get_embed(), view=self)
    
    @ui.button(label="⚙️ ระบบ", style=discord.ButtonStyle.success, row=1)
    async def system_page(self, interaction: discord.Interaction, button: ui.Button):
        self.current_page = 4
        self.update_buttons()
        await interaction.response.edit_message(embed=self.get_embed(), view=self)
