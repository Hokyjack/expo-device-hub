#!/usr/bin/env bun
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const manager = process.argv[2];
if (manager !== "npm" && manager !== "pnpm") {
  throw new Error("Usage: bun scripts/package-install-smoke.ts <npm|pnpm>");
}

const packageRoot = resolve(import.meta.dir, "..");
const temporaryRoot = mkdtempSync(join(tmpdir(), `hub-install-${manager}-`));
function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, CI: "1" },
  });
}

try {
  const packed = JSON.parse(
    run(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temporaryRoot],
      packageRoot,
    ),
  ) as { filename: string }[];
  const tarball = join(temporaryRoot, packed[0]!.filename);
  const consumer = join(temporaryRoot, "consumer");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), '{"name":"hub-install-smoke","private":true}\n');
  const install =
    manager === "npm"
      ? run("npm", ["install", "--no-audit", "--no-fund", tarball], consumer)
      : run(
          "npm",
          [
            "exec",
            "--yes",
            "--package=pnpm@11.0.0",
            "--",
            "pnpm",
            "add",
            tarball,
            "--config.strict-dep-builds=true",
            "--store-dir",
            join(temporaryRoot, "store"),
          ],
          consumer,
        );
  console.log(install.trim());

  const probe = join(consumer, "probe.mjs");
  writeFileSync(
    probe,
    `
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const publisherUrl = pathToFileURL(require.resolve("expo-device-hub/vendor/serve-emu/dist/webrtc-publisher.js")).href;
const { createWebRtcPublisher } = await import(publisherUrl);
const ndc = createRequire(publisherUrl)("node-datachannel");
try {
  const publisher = await createWebRtcPublisher({
    settings: { transport: "webrtc", codec: "h264", iceServers: [], iceTransportPolicy: "all" },
    onKeyframeRequest() {},
  });
  publisher.close();
} finally {
  ndc.cleanup();
}
console.log("Native WebRTC loaded successfully");
`,
  );
  console.log(run("node", [probe], consumer).trim());
  const help = run(
    "node",
    [join(consumer, "node_modules", "expo-device-hub", "dist", "server", "cli.mjs"), "--help"],
    consumer,
  );
  if (!help.includes("Usage:")) throw new Error("Installed Hub CLI did not print help");
  console.log(`${manager} package install smoke test passed`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
