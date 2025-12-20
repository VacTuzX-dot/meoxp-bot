import asyncio
from config import bot, TOKEN


# List of cogs to load
COGS = [
    'cogs.events',
    'cogs.music',
    'cogs.tts',
    'cogs.admin',
    'cogs.utility',
]


async def load_cogs():
    """Load all cogs"""
    for cog in COGS:
        try:
            await bot.load_extension(cog)
            print(f'✅ Loaded: {cog}')
        except Exception as e:
            print(f'❌ Failed to load {cog}: {e}')


async def main():
    async with bot:
        await load_cogs()
        await bot.start(TOKEN)


# Start Bot
if TOKEN:
    asyncio.run(main())
else:
    print("Error: ไม่พบ Token ในไฟล์ .env")