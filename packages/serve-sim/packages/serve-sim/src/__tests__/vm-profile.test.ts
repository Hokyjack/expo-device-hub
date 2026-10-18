import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configureVmProfile } from "../vm-profile";

const ID = "11111111-2222-3333-4444-555555555555";
const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "vm-profile-")); dirs.push(directory);
  const states = new Map<string, { loaded: boolean; disabled: boolean }>();
  const calls: string[][] = [];
  let physical = false, deny = "", scanners = "";
  const deps = {
    directory, uid: 501, exists: () => true,
    run(file: string, args: string[]) {
      calls.push([file, ...args]);
      if (file.endsWith("sysctl")) return physical ? "0" : "1";
      if (file.endsWith("ps")) return scanners;
      if (args.join(" ") === "simctl list devices -j") return JSON.stringify({ devices: { runtime: [{ udid: ID }] } });
      if (args.join(" ") === "simctl list runtimes -j") return JSON.stringify({ runtimes: [{ identifier: "runtime", bundlePath: "/runtime" }] });
      const at = args.indexOf("launchctl") >= 0 ? args.indexOf("launchctl") : args.indexOf("/bin/launchctl");
      const action = args[at + 1]!, target = args[at + 2]!, plist = args[at + 3]!;
      const key = action === "bootstrap" ? `${target}/${plist.split("/").pop()!.replace(/\.plist$/, "")}` : target;
      const get = (key: string) => { if (!states.has(key)) states.set(key, { loaded: true, disabled: false }); return states.get(key)!; };
      if (action === "print-disabled") return [...states.entries()].filter(([k, s]) => k.startsWith(`${target}/`) && s.disabled).map(([k]) => `"${k.slice(target.length + 1)}" => disabled`).join("\n");
      const state = get(key);
      if (action === "disable" && target.includes(deny) && deny) throw Object.assign(new Error("protected service"), { status: 1 });
      if (action === "print" && !state.loaded) throw Object.assign(new Error("absent"), { status: 113 });
      if (action === "disable") state.disabled = true;
      if (action === "enable") state.disabled = false;
      if (action === "bootout") state.loaded = false;
      if (action === "bootstrap") state.loaded = true;
      return "";
    },
  };
  return { deps, states, calls, physical: () => { physical = true; }, deny: (s: string) => { deny = s; }, scanners: (s: string) => { scanners = s; } };
}

test("default tuning never elevates or queries devices on a physical host", () => {
  const f = fixture(); f.physical();
  expect(configureVmProfile(true, [ID], f.deps)).toEqual({ skipped: "not a VM" });
  expect(f.calls).toHaveLength(1);
});

test("tunes all three groups, remains idempotent, and restores original settings", () => {
  const f = fixture();
  const original = { loaded: false, disabled: true };
  f.states.set("system/com.apple.XProtect.daemon.scan", { ...original });
  expect(configureVmProfile(true, [ID], f.deps).disabled).toHaveLength(8);
  expect([...f.states.values()].every((s) => s.disabled && !s.loaded)).toBe(true);
  configureVmProfile(true, [ID], f.deps);
  configureVmProfile(false, [], f.deps);
  expect(f.states.get("system/com.apple.XProtect.daemon.scan")).toEqual(original);
  expect(f.states.get("user/foreground/com.apple.apsd")).toEqual({ loaded: true, disabled: false });
  expect(JSON.parse(readFileSync(join(f.deps.directory, "state.json"), "utf8"))).toEqual({});
});

test("permission failure rolls back changes instead of claiming suppression", () => {
  const f = fixture(); f.deny("daemon.scan.startup");
  expect(() => configureVmProfile(true, [ID], f.deps)).toThrow("protected service");
  expect([...f.states.values()].every((s) => !s.disabled && s.loaded)).toBe(true);
});

test.each([
  "/Library/Apple/System/Library/CoreServices/XProtect.app/Contents/MacOS/XProtectRemediatorMRTv3",
  "/Library/Apple/System/Library/CoreServices/XProtect.app/Contents/XPCServices/XProtectPluginService.xpc/Contents/MacOS/XProtectPluginService",
])("remaining scanner %s fails verification and restores launchers", (scanner) => {
  const f = fixture(); f.scanners(scanner);
  expect(() => configureVmProfile(true, [ID], f.deps)).toThrow("active XProtect scanners");
  expect([...f.states.values()].every((s) => !s.disabled && s.loaded)).toBe(true);
});

test("untrusted persisted labels cannot become privileged commands", () => {
  const f = fixture(); configureVmProfile(true, [], f.deps);
  const file = join(f.deps.directory, "state.json");
  writeFileSync(file, JSON.stringify({ "host:system:arbitrary": { disabled: false, loaded: true } }));
  f.calls.length = 0;
  expect(() => configureVmProfile(false, [], f.deps)).toThrow("Invalid VM profile service state");
  expect(f.calls.some((c) => c[0]!.endsWith("sudo"))).toBe(false);
});
