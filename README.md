# MEOXP Bot 🎀

Discord bot สำหรับเล่นเพลงและ TTS ภาษาไทย

## Features

- 🎵 **Music** - เล่นเพลงจาก YouTube (รองรับ playlist 1000 เพลง)
- 🗣️ **TTS** - Text-to-Speech ภาษาไทย/อังกฤษ
- 🛠️ **Utility** - คำสั่งช่วยเหลือทั่วไป

## Commands

### Music

| Command               | Description  |
| --------------------- | ------------ |
| `!!play <url/search>` | เล่นเพลง     |
| `!!skip`              | ข้ามเพลง     |
| `!!pause`             | หยุดชั่วคราว |
| `!!resume`            | เล่นต่อ      |
| `!!queue`             | ดู queue     |
| `!!np`                | เพลงปัจจุบัน |
| `!!volume <0-100>`    | ปรับเสียง    |
| `!!stop`              | หยุดและออก   |

### TTS

| Command         | Description   |
| --------------- | ------------- |
| `!!say <text>`  | พูดภาษาไทย    |
| `!!saye <text>` | พูดภาษาอังกฤษ |

## Setup

```bash
# Clone
git clone https://github.com/VacTuzX-dot/meoxp-bot.git
cd meoxp-bot

# Create .env
echo "DISCORD_TOKEN=your_token" > .env

# Run with Docker
docker-compose up -d
```

## Requirements

- Docker & Docker Compose
- Discord Bot Token

## License

MIT
