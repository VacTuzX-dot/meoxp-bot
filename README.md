# MEOXP Bot

A Discord music bot built with TypeScript, discord.js, and Shoukaku (Lavalink).

## Features

- Music playback via Lavalink
- YouTube search and playlist support
- Queue management with loop modes
- Interactive controls with buttons
- Persistent join mode

## Commands

### Music

| Command          | Aliases      | Description                   |
| ---------------- | ------------ | ----------------------------- |
| `!!play <query>` | `p`          | Play music from URL or search |
| `!!skip`         | `s`          | Skip current track            |
| `!!stop`         | -            | Pause playback                |
| `!!resume`       | -            | Resume playback               |
| `!!queue`        | `q`          | View queue with pagination    |
| `!!np`           | `nowplaying` | Show current track            |
| `!!loop`         | -            | Toggle loop mode              |
| `!!shuffle`      | -            | Shuffle queue                 |
| `!!clear`        | -            | Clear queue                   |
| `!!join`         | `j`          | Join and stay until leave     |
| `!!leave`        | -            | Leave voice channel           |
| `!!panel`        | `c`          | Music control panel           |

### Utility

| Command       | Description                    |
| ------------- | ------------------------------ |
| `!!help`      | Show help menu                 |
| `!!status`    | Show bot status                |
| `!!purge <n>` | Delete n messages (owner only) |

## Setup

### Requirements

- Node.js 18+ or Bun
- Lavalink server
- Docker (optional)

### Environment Variables

```
TOKEN=your_discord_bot_token
OWNER_ID=your_discord_user_id
LAVALINK_URL=host:port
LAVALINK_PASSWORD=password
```

### Run with Docker

```bash
docker-compose up -d --build
```

### Run Locally

```bash
bun install
bun run build
bun run start
```

## Tech Stack

- TypeScript
- discord.js v14
- Shoukaku (Lavalink wrapper)
- Bun runtime
- Docker

## Project Structure

```
src/
  commands/     # Command handlers
  events/       # Event handlers
  lib/          # Utilities
  types/        # TypeScript types
  index.ts      # Entry point
```

## License

MIT
