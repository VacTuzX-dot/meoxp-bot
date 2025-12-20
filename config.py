# --- CONFIG ---
import discord
from discord.ext import commands
import os
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv('DISCORD_TOKEN')

# ใส่ Discord ID ของคุณคนเดียวเท่านั้น (เพื่อความปลอดภัยตอนสั่งรัน Command)
MY_OWNER_ID = 942687569693528084

# Setup Bot
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!!', intents=intents, help_command=None)
