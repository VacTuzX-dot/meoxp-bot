import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const hooksPath = ".githooks";

function gitOutput(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitQuiet(args) {
  execFileSync("git", args, {
    cwd: repoRoot,
    stdio: "ignore",
  });
}

if (process.env.CI || process.env.SKIP_GIT_HOOKS === "1") {
  process.exit(0);
}

if (!existsSync(path.join(repoRoot, hooksPath))) {
  console.warn(`[hooks] Skipping setup because ${hooksPath} is missing.`);
  process.exit(0);
}

try {
  if (gitOutput(["rev-parse", "--is-inside-work-tree"]) !== "true") {
    process.exit(0);
  }

  const currentHooksPath = gitOutput([
    "config",
    "--local",
    "--get",
    "core.hooksPath",
  ]);

  if (currentHooksPath === hooksPath) {
    console.log(`[hooks] core.hooksPath is already ${hooksPath}.`);
    process.exit(0);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  if (!message.includes("core.hooksPath")) {
    console.warn(`[hooks] Skipping setup: ${message}`);
    process.exit(0);
  }
}

try {
  gitQuiet(["config", "--local", "core.hooksPath", hooksPath]);
  console.log(`[hooks] Configured core.hooksPath=${hooksPath}.`);
  console.log("[hooks] Set SKIP_GIT_HOOKS=1 before install to skip this step.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[hooks] Failed to configure hooks: ${message}`);
}
