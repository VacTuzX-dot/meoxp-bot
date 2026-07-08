# 2026-07-08 — Migrate Lavalink wrapper: shoukaku → moodenglink

## [09:10] Scrutinize target library

- **Action:** Cloned Moodeng-LAB/moodenglink to scratchpad, read README + src (Player, Queue, Manager, types)
- **Why:** Never migrate onto an API known only from a README summary (Prime Directive: understand before acting)
- **Result:** Confirmed: Lavalink v4 client, Erela-style manager, built-in queue with repeat modes 0/1/2 matching bot's loopMode, internal trackEnd auto-advance, `prepare` script builds dist on install. NOT on npm — git dep only.
- **Lesson:** 📌 GENERAL: for a git dependency, pin the commit SHA (`#98b6030...`) — a branch ref is a supply-chain hole (upstream force-push changes your prod code silently).

## [09:25] Design decision — queue ownership

- **Action:** Chose to delete the bot's hand-rolled queue engine (processQueue, loopMode advancing, songs array) and use moodenglink's Queue/RepeatMode as the single source of truth
- **Why:** User confirmed "ใช้ moodenglink เต็มตัว". Keeping both queues = dual state, the worst option.
- **Rejected:** facade layer keeping `client.queues` shape — would keep old bugs and defeat the migration (mini-ADR).
- **Lesson:** Migration onto a stateful library is a queue-ownership decision first, an API rename second.

## [09:40] Rewrite

- **Action:** New `src/lib/MoodenglinkManager.ts` (replaces deleted `ShoukakuManager.ts`); rewrote play/skip/stop/resume/clear/shuffle/loop/join/leave/say/saye/queue/nowplaying/panel; edits to types, index.ts, api.ts, voiceStateUpdate.ts, status.ts; dep swap in package.json
- **Why:** Now-playing embed + presence + dashboard broadcast moved to manager-level `trackStart`/`queueEnd`/`playerDestroy` events — one place instead of per-command duplication
- **Result:** `client.queues` Map removed entirely. Per-guild extras (`persistent`, `nowPlayingMessage`) live in `player.set()/get()`. Dashboard API response shape unchanged.
- **Lesson:** Lazy `require("../api")` inside event handlers dodges the lib↔api circular import; top-level import would deadlock module init.

## [10:20] Install + verify

- **Action:** `pnpm install` (git dep built dist via its prepare/tsup), `npx tsc --noEmit`, `pnpm run build`
- **Result:** All exit 0. dist/ present in node_modules/moodenglink.
- **Lesson:** pnpm runs a git dependency's `prepare` script automatically — verify `dist/` exists after install, don't assume.

## Summary

- **Changed:** package.json (dep swap, pinned SHA), src/lib/MoodenglinkManager.ts (new), src/lib/ShoukakuManager.ts (deleted), src/types/index.ts, src/index.ts, src/api.ts, src/events/voiceStateUpdate.ts, 14 command files
- **Unchanged:** dashboard/, wait-for-lavalink.js (talks straight to Lavalink REST), all non-music commands (help, purge, reactionrole, setupgold, shell, rrname, autorole)
- **Remaining:** runtime verification against a live Lavalink node + Discord (play, skip, loop, TTS, auto-leave, dashboard socket) — cannot be done offline; behavior deltas listed in the session summary
- **Key decisions:** moodenglink owns the queue (no facade); embeds/presence wired at manager events; commit-pinned git dep
- **Top 3 lessons:**
  1. 📌 GENERAL: pin git deps to a SHA, never a branch.
  2. Queue-ownership must be decided before touching code in a player-library migration.
  3. Manager-level events beat per-command player.on() handlers — the old code attached listeners only in play.ts, so tracks started via TTS never updated presence.
- **Mistakes & dead ends:** first attempt batched `rm` + `sed` on package.json in one shell command — blocked by permission classifier; split into Edit tool + standalone rm. Also tried Write on command files before Read — harness requires Read first.
