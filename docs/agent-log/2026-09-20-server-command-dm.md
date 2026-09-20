# !!server in DMs

## Debug

- **Symptom:** `!!server` in a DM to the bot does nothing.
- **Fail path (traced):**
  1. `src/index.ts` intents lack `GatewayIntentBits.DirectMessages` → Discord never delivers DM `messageCreate` events.
  2. `src/events/messageCreate.ts` returned on `!message.guild` before command dispatch → DMs dropped even if delivered.
- **Lesson:** a Discord DM needs three things: the `DirectMessages` intent, `Partials.Channel` (DM channels aren't cached), and a handler that doesn't bail on `!message.guild`. Missing any one = silent no-op.

## Fix

- Added `DirectMessages` intent (non-privileged — no Developer Portal change).
- `Command.dm?: boolean` opt-in; handler allows DMs only for `dm: true`. Guild guard moved below command dispatch so TTS logic still requires a guild.
- `!!server` → `dm: true` (owner check uses `message.author.id`, works in DMs).
  - Rejected: allowing all commands in DMs — 17 commands use `message.guild`/`member` and would crash.
  - Rejected: `!!shell` in DMs — remote shell reachable by DM widens attack surface for no need.
- Test: `tests/messageCreate.test.ts` (DM + opt-in runs, DM without opt-in ignored, guild runs).
- **Result:** tests 24/24, typecheck OK, no new lint warnings.
- **Lesson:** 📌 GENERAL: when opening a new entry point (DMs, public API), make it opt-in per handler — default-deny keeps every existing handler's assumptions valid.

## Summary

- Changed: src/index.ts, src/types/index.ts, src/events/messageCreate.ts, src/commands/status.ts, tests/messageCreate.test.ts.
- Remaining: merge → CI deploy → DM `!!server` to verify.
