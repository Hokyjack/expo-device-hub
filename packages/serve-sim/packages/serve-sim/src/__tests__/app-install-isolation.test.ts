import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installAppAsync } from "../app-install";
import { installShims, UDID } from "./helpers";

test("FIFO install sources cannot exhaust the Node server's filesystem pool", async () => {
  const directory = await mkdtemp(join(tmpdir(), "install-isolation-test-"));
  try {
    const built = await Bun.build({
      entrypoints: [
        fileURLToPath(new URL("./fixtures/app-install-fifo.child.ts", import.meta.url)),
      ],
      target: "node",
      format: "esm",
      outdir: directory,
    });
    expect(built.success).toBe(true);
    const result = spawnSync("node", [built.outputs[0]!.path], {
      timeout: 5000,
      encoding: "utf8",
      env: {
        ...process.env,
        UV_THREADPOOL_SIZE: "4",
        INSTALL_TEST_BIN: fileURLToPath(new URL("../../dist/serve-sim.js", import.meta.url)),
      },
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout);
    expect(report.readable).toBe(true);
    expect(report.results).toHaveLength(5);
    for (const install of report.results)
      expect(install).toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining("regular file"),
      });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a stalled preparation child is killed and reported as an install timeout", async () => {
  const shims = installShims({ prepare: "#!/bin/sh\nexec sleep 10\n" });
  const start = Date.now();
  try {
    const result = await installAppAsync(
      UDID,
      "/unused",
      Date.now() + 50,
      join(shims.dir, "prepare"),
    );
    expect(result).toMatchObject({
      exitCode: 1,
      timedOut: true,
      stderr: "App installation timed out.",
    });
    expect(Date.now() - start).toBeLessThan(1500);
  } finally {
    shims.restore();
  }
});
