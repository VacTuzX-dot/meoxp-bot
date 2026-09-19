import assert from "node:assert/strict";
import test from "node:test";
import { parsePrettyName } from "../src/commands/status";

test("parsePrettyName reads quoted PRETTY_NAME", () => {
  const osRelease =
    'NAME="Debian GNU/Linux"\nPRETTY_NAME="Debian GNU/Linux 13 (trixie)"\nID=debian\n';
  assert.equal(parsePrettyName(osRelease), "Debian GNU/Linux 13 (trixie)");
});

test("parsePrettyName reads unquoted PRETTY_NAME", () => {
  assert.equal(parsePrettyName("PRETTY_NAME=Alpine\n"), "Alpine");
});

test("parsePrettyName returns undefined when missing or empty", () => {
  assert.equal(parsePrettyName(""), undefined);
  assert.equal(parsePrettyName('ID=debian\nPRETTY_NAME=""\n'), undefined);
});
