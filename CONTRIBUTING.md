# Contributing

## Expected workflow

- Do not push directly to `main` or `master`.
- Create a short-lived branch from `main`.
- Push that branch and open a pull request.
- Merge through GitHub after the required checks pass.

## First-time local setup

After cloning, run:

```bash
pnpm install
```

The root `prepare` script configures `core.hooksPath=.githooks` in your local clone.

If you skipped install scripts or want to restore the repo hooks later, run:

```bash
pnpm run setup:hooks
```

## What the local hook blocks

The repo-managed `pre-push` hook blocks these operations by default:

- any direct push to `main`
- any direct push to `master`
- any non-fast-forward branch update, which usually means `git push --force`, `git push --force-with-lease`, or another history rewrite

## Important limits

This repository can reduce mistakes in a prepared clone, but it cannot absolutely prevent destructive pushes after someone clones it.

- Git does not activate versioned hooks automatically on clone. The local hook only becomes active after the contributor runs `pnpm install` or `pnpm run setup:hooks`.
- Local hooks can be bypassed with `git push --no-verify`.
- Contributors can also change `core.hooksPath`, delete the hook, or push from a different clone that never installed the hook.
- Because of that, GitHub rulesets or branch protection must enforce the canonical policy remotely.

## Emergency local bypass

For deliberate repository-admin operations, you can bypass the local hook for one command:

```bash
ALLOW_REPO_PUSH_BYPASS=1 git push ...
```

Use this only when you intentionally need to bypass the local safety net and the remote GitHub policy also allows the push.

## Recommended GitHub enforcement

Use repository rulesets if they are available for this repository and plan. If rulesets are unavailable, configure classic branch protection rules with the same intent.

Protect `main` and `master` with:

- require a pull request before merging
- require the `build-and-test` check to pass before merging
- require branches to be up to date before merging
- require conversation resolution before merging
- block force pushes
- restrict deletions
- apply the rule to administrators

Recommended review settings:

- require 1 approval if at least two maintainers can review PRs
- otherwise, for a solo-maintainer repository, keep required approvals at `0` but still require PRs and status checks
- dismiss stale approvals when new commits are pushed
- require approval of the most recent reviewable push when multiple maintainers are available
- require code owner review if you later add `CODEOWNERS`
