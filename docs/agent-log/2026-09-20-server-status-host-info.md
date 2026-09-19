# !!server command — host info fixes

## [review] Recon

- **Action:** read `src/commands/status.ts`, `src/api.ts`; ssh `debian` compare container vs host.
- **Result:** container reports hostname `1bfcaa307744` (host: `meox`) and distro Debian 12 bookworm (host: Debian 13 trixie).
- **Lesson:** `systeminformation` inside Docker sees the container's UTS namespace and `/etc`, but the host's `/proc` — so CPU/RAM are host values while hostname/distro are not.

## Fixes

- **Action:** `src/commands/status.ts`, `docker-compose.yml`, `tests/status.test.ts`.
  1. Mount host `/etc/hostname` + `/etc/os-release` read-only at `/host/*`; `hostInfo()` reads them, falls back to `si.osInfo()` (local dev).
     - Rejected: `hostname: meox` in compose — fixes hostname only, leaves distro wrong, and hardcodes the machine name.
  2. CPU load: prime `si.currentLoad()` + 500ms sample (first call measured since boot / last run).
  3. RAM label → "RAM (host)" + bot process RSS (container is capped at 1G).
  4. Progress bar clamped to [0,1] — out-of-range ratio made `String.repeat` throw.
- **Result:** tests 19/19 (3 new for `parsePrettyName`), typecheck 0 errors, lint no new warnings.
- **Lesson:** 📌 GENERAL: to show host identity from a container, bind-mount the specific host files read-only — don't hand the container more of the host than it needs.

## Summary

- Changed: status.ts, docker-compose.yml, tests/status.test.ts.
- Remaining: merge PR → CI deploys (`docker compose up -d` recreates bot with the new mounts); verify `!!server` shows `meox` / Debian 13.
- Mistakes & dead ends: none.

## Copilot review (PR #6)

- **Escaped quotes in os-release** — accepted. Verified: old regex returned `undefined` (not truncated as claimed) → fell back to container distro. New parser handles double-quoted with `\` escapes, single-quoted, bare. +2 tests; parses real host file → `Debian GNU/Linux 13 (trixie)`.
- **Serialize overlapping currentLoad()** — declined, `ponytail:` comment added. Only caller is owner-only `!!server`; race needs two runs within 500ms and only skews one reading. Upgrade path: shared in-flight sample promise if another caller appears.
- **Result:** tests 21/21, typecheck OK, no new lint warnings.
- **Lesson:** reproduce a reviewer's claimed failure before fixing — the symptom here differed from the description (fallback, not truncation), which changes how severe it is.
