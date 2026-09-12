# Lavalink config swap (application.yml)

Task: replace `lavalink/application.yml` with a user-provided config, implement locally, and apply on the production server `root@192.168.0.234` (host `debian` / `meox`).

## [01:15] Recon

- **Action:** read local `lavalink/application.yml`, `docker-compose.yml`; `rg` for bot→lavalink wiring; ssh `debian` `docker ps` + inspect mounts.
- **Why:** understand before acting (Prime Directive 1). Must know how the bot reaches Lavalink before swapping the config.
- **Result:**
  - Bot connects via env `LAVALINK_URL` / `LAVALINK_PASSWORD` (`src/lib/ShoukakuManager.ts` / `MoodenglinkManager`), wait-for-lavalink.js defaults port 2333.
  - Server runs `ghcr.io/lavalink-devs/lavalink:4`, publishes `2333`, config mounted `/root/lavalink/application.yml -> /opt/Lavalink/application.yml`.
  - `docker exec printenv` and grepping the server config were blocked by the auto-mode classifier (password keyword) — did not read runtime secrets.
- **Lesson:** the provided file was a generic template (port 8352, `password: "NOPE"`, empty oauth token, Milin external IPs). Deploying it verbatim would break auth, port reachability, and YouTube OAuth. Always diff a dropped-in config against the live deployment's contract.

## [01:16] Write merged config

- **Action:** overwrite `lavalink/application.yml` with the new config, minus deployment-breaking values.
- **Why:** adopt the new substance (lavasrc/lavasearch/lavalyrics/java-lyrics, richer sources/filters/timeouts) while preserving the working deployment contract. Security gate (Directive 6): never hardcode secrets.
- **Changes vs provided file:**
  - `server.password` → `${LAVALINK_SERVER_PASSWORD}` (was `"NOPE"`).
  - `oauth.refreshToken` → `${YOUTUBE_OAUTH_REFRESH_TOKEN:}` (was empty — would break YouTube).
  - `server.port` → `2333` (was 8352 — must match published container port + bot env).
  - `http2.enabled` → `false` (match known-good running config).
  - Dropped `Milin-Plugin` dependency + entire `plugins.milin` block (needs yt-dlp binary + external hardcoded IPs not verified in this deployment). User chose "only what actually works".
- **Result:** `python3 -c "yaml.safe_load(...)"` → `YAML OK`. Diff: 160 insertions, 50 deletions.
- **Lesson:** merging a config beats swapping it — keep the values that encode infra contracts (port, secrets, token), take the values that are pure feature config.

## Risks flagged

- 🟠 youtube `clients` list changed (`TV,MUSIC,ANDROID_VR,WEB,WEBEMBEDDED,MWEB,ANDROID_MUSIC,TVHTML5_SIMPLY`) vs the recently-tuned `MUSIC,TV,IOS`+TVHTML5 pipeline (commits 478e3aa/b478f0f). If YouTube playback breaks after deploy, this list is suspect #1.

## Remaining

- Deploy to server `debian`: copy config, restart `lavalink` container, verify logs (plugins load, OAuth) + playback. Restart is disruptive to active listeners → confirm before running.

## [01:18] Deploy — success

- **Action:** backup (`application.yml.bak-20260913-011601`), scp new config, `docker compose restart lavalink`, poll startup, verify lavalink + bot logs.
- **Why:** apply on prod server per task. Backup first = rollback path (Pause-before-irreversible).
- **Result:**
  - All 5 plugins downloaded + loaded (lavasrc 4.8.3, lavasearch 1.0.0, lavalyrics 1.1.0, java-lyrics 1.6.6, youtube f45bbb7). Milin absent as intended.
  - `Undertow started on port 2333`, `Lavalink is ready`, zero errors.
  - `YouTube access token refreshed successfully` → env oauth token substitution works.
  - YouTube clients init: TVHTML5, WEB_REMIX(MUSIC), ANDROID_VR, WEB, WEB_EMBEDDED_PLAYER, MWEB, ANDROID_MUSIC, TVHTML5_SIMPLY.
  - Bot node "Main": transient ECONNREFUSED during restart window → `connected and ready!` (password env matched — no 401).
  - Container `healthy`.
- **Lesson:** verify secrets via behavior, not by reading them — "token refreshed successfully" + "node connected and ready" prove the env substitutions work without ever printing the values (classifier blocked reading them anyway).

## Summary

- **Changed:** `lavalink/application.yml` (local + server `/root/lavalink/application.yml`).
- **Unchanged:** docker-compose.yml, bot env, wait-for-lavalink.js (kept port 2333 → no infra change needed).
- **Remaining:** commit local change (not yet committed); watch for YouTube playback issues from the new client list (flagged risk).
- **Key decisions:**
  1. Merge, not swap — kept port/password/oauth as deployment contract, took new plugins/sources/filters.
  2. Secrets stay env `${...}` — refused to hardcode `"NOPE"` / empty token (security gate).
  3. Dropped Milin-Plugin — needs yt-dlp binary + unverified external IPs (user: "only what works").
- **Top lessons:**
  1. 📌 GENERAL: a dropped-in config is a template until proven — diff it against the live deployment's port/secret/token contract before applying.
  2. 📌 GENERAL: back up remote config to a timestamped `.bak` before overwrite; it's the whole rollback plan for one command.
  3. Verify env-substituted secrets by behavior (token-refresh / node-ready log lines), never by printing them.
- **Mistakes & dead ends:** initial `find / -name application.yml` over the whole server FS hung (120s+) → killed, replaced with scoped `docker inspect` mount lookup. `docker exec printenv` / grep-on-password-config blocked by auto-mode classifier → pivoted to behavior-based verification.

## [01:36] Review fixes (Copilot PR #5) + redeploy

- **Action:** 3 fixes on branch, redeploy, `git push`.
  1. `logging.request.enabled` true→false (+ includePayload/ClientInfo false) — imported from template verbatim; was logging search/user metadata on high-volume prod + 1GB×25 disk.
  2. `youtubePlaylistLoadLimit` 6→50 — template regressed the prior 50.
  3. README: documented Lavalink-side `LAVALINK_SERVER_PASSWORD` + `YOUTUBE_OAUTH_REFRESH_TOKEN`, noting the `${VAR:}` empty fallback masks YouTube failures.
- **Result:** YAML OK; redeploy verified (port 2333, `token refreshed successfully`, 0 errors, bot node reconnected). Commit `567b68b` pushed to PR #5.
- **Lesson:** 📌 GENERAL: two of three review findings were template values I carried over without questioning (request logging, playlist limit). When merging a config, audit every non-secret value against the previous known-good, not just the port/password/token contract — defaults in a stranger's template are decisions, not neutral.
