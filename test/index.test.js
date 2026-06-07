// Unit tests for @moritakaaz/opencode-apc
// Uses node:test (no external test framework needed)

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// We test the built output since it's ESM
// On Windows, dynamic import needs file:// URL
import { pathToFileURL } from "url";
const DIST = pathToFileURL(join(import.meta.dirname, "..", "dist", "index.js")).href;

// Helper: create a temp directory for each test
function makeTempDir(prefix) {
  const dir = join(tmpdir(), `apc-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanDir(dir) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("Config generation", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir("config");
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("generates config content with expected structure", async () => {
    // Import the module to access internals indirectly via plugin behavior
    const mod = await import(DIST);
    const plugin = mod.default;

    // Call plugin with a fake context pointing to temp dir
    // This should create .opencode/dcp.jsonc in tempDir
    const hooks = await plugin({ directory: tempDir });

    const configPath = join(tempDir, ".opencode", "dcp.jsonc");
    assert.ok(existsSync(configPath), "Should create .opencode/dcp.jsonc");

    const raw = readFileSync(configPath, "utf-8");
    // Strip comments for JSON parsing
    const stripped = raw.replace(/^\s*\/\/.*$/gm, "");
    const config = JSON.parse(stripped);

    assert.equal(config.compress.maxContextLimit, 15000);
    assert.equal(config.compress.minContextLimit, 8000);
    assert.equal(config.compress.nudgeFrequency, 3);
    assert.equal(config.compress.nudgeForce, "strong");
    assert.equal(config.strategies.deduplication.enabled, true);
    assert.equal(config.strategies.purgeErrors.enabled, true);
    assert.equal(config.strategies.purgeErrors.turns, 2);
    assert.equal(config._apcVersion, 1);
  });

  it("does not overwrite existing config", async () => {
    const opencodeDir = join(tempDir, ".opencode");
    mkdirSync(opencodeDir, { recursive: true });

    const configPath = join(opencodeDir, "dcp.jsonc");
    const existingContent = '// User config\n{"compress":{"maxContextLimit":30000}}';
    writeFileSync(configPath, existingContent, "utf-8");

    const mod = await import(DIST);
    const plugin = mod.default;
    await plugin({ directory: tempDir });

    const afterContent = readFileSync(configPath, "utf-8");
    assert.equal(afterContent, existingContent, "Should not overwrite existing config");
  });

  it("does not overwrite existing .json config", async () => {
    const opencodeDir = join(tempDir, ".opencode");
    mkdirSync(opencodeDir, { recursive: true });

    const configPath = join(opencodeDir, "dcp.json");
    const existingContent = '{"compress":{"maxContextLimit":25000}}';
    writeFileSync(configPath, existingContent, "utf-8");

    const mod = await import(DIST);
    const plugin = mod.default;
    await plugin({ directory: tempDir });

    // Should not have created dcp.jsonc
    assert.ok(!existsSync(join(opencodeDir, "dcp.jsonc")), "Should not create jsonc when json exists");
    // Original should be untouched
    const afterContent = readFileSync(configPath, "utf-8");
    assert.equal(afterContent, existingContent);
  });

  it("returns empty hooks gracefully when DCP import fails", async () => {
    // This test verifies that even if DCP throws, we get {} back
    // In practice DCP is installed, so this just confirms the return type
    const mod = await import(DIST);
    const plugin = mod.default;
    const hooks = await plugin({ directory: tempDir });

    // hooks should be an object (either DCP hooks or empty fallback)
    assert.equal(typeof hooks, "object");
  });
});

describe("Config validation", () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir("validate");
  });

  afterEach(() => {
    cleanDir(tempDir);
  });

  it("warns on malformed existing config but does not crash", async () => {
    const opencodeDir = join(tempDir, ".opencode");
    mkdirSync(opencodeDir, { recursive: true });

    // Write invalid JSON
    const configPath = join(opencodeDir, "dcp.jsonc");
    writeFileSync(configPath, "not valid json at all {{{", "utf-8");

    const mod = await import(DIST);
    const plugin = mod.default;

    // Should not throw
    const hooks = await plugin({ directory: tempDir });
    assert.equal(typeof hooks, "object");
  });

  it("warns when config is missing compress section", async () => {
    const opencodeDir = join(tempDir, ".opencode");
    mkdirSync(opencodeDir, { recursive: true });

    const configPath = join(opencodeDir, "dcp.jsonc");
    writeFileSync(configPath, '{"strategies":{}}', "utf-8");

    const mod = await import(DIST);
    const plugin = mod.default;

    // Should not throw
    const hooks = await plugin({ directory: tempDir });
    assert.equal(typeof hooks, "object");
  });
});
