import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  actionTimeoutMs,
  createSerialQueue,
  installAppInvocation,
  runInvocation,
  type HostActionResult,
} from "./host-actions-utils";

const installArchive = createSerialQueue();
const CLEANUP_TIMEOUT_MS = 1000;

export async function installAppAsync(
  udid: string,
  path: string,
  deadline = Date.now() + actionTimeoutMs(),
  serveSimBinPath = "serve-sim",
): Promise<HostActionResult> {
  return installArchive(async () => {
    const directory = join(tmpdir(), `serve-sim-app-install-${randomUUID()}`);
    const remaining = () => Math.max(1, deadline - Date.now());
    let result: HostActionResult = {
      stdout: "",
      stderr: "App installation timed out.",
      exitCode: 1,
      timedOut: true,
    };
    try {
      if (Date.now() < deadline) {
        const prepared = await runInvocation({
          file: serveSimBinPath,
          args: ["_prepare-app-install", path, directory],
          timeoutMs: remaining(),
        });
        if (prepared.exitCode !== 0) result = prepared;
        else if (Date.now() < deadline) {
          const app: unknown = JSON.parse(prepared.stdout);
          if (typeof app !== "string" || !(app === path || app.startsWith(directory + "/")))
            throw new Error("App preparation returned an invalid path.");
          result = await runInvocation({
            ...installAppInvocation(udid, app),
            timeoutMs: remaining(),
          });
        }
      }
    } catch {
      result = { stdout: "", stderr: "App preparation failed.", exitCode: 1 };
    } finally {
      if (result.timedOut) result.stderr = "App installation timed out.";
      // Preparation has exited, closing all writers before removal. Cleanup
      // gets one bounded second after an expired action deadline.
      const cleanup = await runInvocation({
        file: "rm",
        args: ["-rf", "--", directory],
        timeoutMs: CLEANUP_TIMEOUT_MS,
      });
      if (cleanup.exitCode !== 0)
        result.stderr += " Temporary app files could not be removed; the host may need cleanup.";
    }
    return result;
  });
}
