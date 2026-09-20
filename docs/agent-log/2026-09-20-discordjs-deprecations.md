# discord.js deprecations

## Version check

- **Action:** `npm view discord.js version dist-tags`.
- **Result:** stable latest = `14.27.0` = what's pinned. v15 exists only as `dev` / `pr-11602` prereleases.
- **Decision:** no version bump. Installing a v15 prerelease into prod fails "boring technology for critical paths" and would be a dependency Hard Stop for no gain.

## Audit + rename

- **Action:** scanned for deprecated APIs (`ready`, `ephemeral`, `MessageEmbed`, `MessageActionRow`, `Intents.FLAGS`, `Permissions.FLAGS`, `fetchReply`, `.deleted`).
- **Found 2 (both forward-compatible today):**
  1. `src/index.ts:36` used the string literal `"ready"`. Verified at runtime that `Events.ClientReady === "clientReady"` in 14.27, so `src/events/ready.ts` was already correct — the warning came from this one literal. Switched to `Events.ClientReady`.
  2. `ephemeral: true` → `flags: MessageFlags.Ephemeral`, 27 occurrences across queue.ts, nowplaying.ts, helpMenu.ts, slashCommands.ts (incl. 3 `deferReply({ ephemeral: true })`).
- **Not found:** no `MessageEmbed`/`MessageActionRow`/`MessageButton`/`Intents.FLAGS`/`Permissions.FLAGS`/`fetchReply`/`.deleted` usage — the codebase is otherwise on v14 builders already.
- **Result:** typecheck OK, tests 24/24, lint 126 warnings / 17 infos = unchanged baseline.
- **Lesson:** 📌 GENERAL: check an enum's runtime value before "fixing" it — `Events.ClientReady` already resolved to the new name, so only the hardcoded string needed changing. Grepping for the old name alone would have produced a pointless edit in ready.ts.

## Summary

- Changed: src/index.ts, src/commands/queue.ts, src/commands/nowplaying.ts, src/lib/helpMenu.ts, src/lib/slashCommands.ts.
- Unchanged: package.json (no bump available), src/events/ready.ts (already correct).
- Remaining: merge → deploy → confirm the DeprecationWarning is gone from bot logs.
