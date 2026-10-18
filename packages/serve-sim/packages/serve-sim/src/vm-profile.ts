import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LABELS = ["com.apple.apsd", "com.apple.intelligencetasksd"];
const XPROTECT = ["com.apple.XProtect.daemon.scan", "com.apple.XProtect.daemon.scan.startup", "com.apple.XprotectFramework.PluginService"];
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type Before = { disabled: boolean; loaded: boolean };
type State = Record<string, Before>;
type Target = { id: string; label: string; domain: string; plist: string; device?: string };
export interface VmProfileDeps {
  run?: (file: string, args: string[]) => string;
  exists?: (path: string) => boolean;
  directory?: string;
  uid?: number;
}
const command = (file: string, args: string[]) => execFileSync(file, args, {
  encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000, maxBuffer: 8 * 1024 * 1024,
});

/** Experimental VM-lifetime tuning. Only VM detection runs on a physical host. */
export function configureVmProfile(enabled: boolean, devices: string[], deps: VmProfileDeps = {}) {
  const run = deps.run ?? command;
  try {
    if (run("/usr/sbin/sysctl", ["-n", "kern.hv_vmm_present"]).trim() !== "1") return { skipped: "not a VM" };
  } catch { return { skipped: "VM detection unavailable" }; }
  if (devices.some((id) => !UUID.test(id))) throw new Error("VM profile requires Simulator UUIDs");
  const directory = deps.directory ?? join(homedir(), ".serve-sim-vm-profile");
  const present = deps.exists ?? existsSync;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, "lock");
  const until = Date.now() + 30_000;
  for (;;) {
    try {
      mkdirSync(lock, { mode: 0o700 });
      writeFileSync(join(lock, "pid"), String(process.pid), { mode: 0o600 });
      break;
    } catch {
      try {
        const pid = Number(readFileSync(join(lock, "pid"), "utf8"));
        if (Number.isSafeInteger(pid) && pid > 0) {
          try { process.kill(pid, 0); } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ESRCH") { rmSync(lock, { recursive: true }); continue; }
          }
        }
      } catch {
        if (existsSync(lock) && Date.now() - statSync(lock).mtimeMs > 30_000) { rmSync(lock, { recursive: true }); continue; }
      }
      if (Date.now() >= until) throw new Error(`Another VM profile operation owns ${lock}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  const file = join(directory, "state.json");
  const save = (state: State) => {
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(state), { mode: 0o600 });
    renameSync(temporary, file);
  };
  try {
    const state: State = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
    if (!state || typeof state !== "object" || Array.isArray(state)) throw new Error("Invalid VM profile state");
    const uid = deps.uid ?? process.getuid!();
    const host = (folder: string, labels: string[], domain: string): Target[] => labels.map((label) => ({
      id: `host:${domain}:${label}`, label, domain, plist: `/Library/Apple/System/Library/${folder}/${label}.plist`,
    }));
    const targets = host("LaunchDaemons", XPROTECT, "system").concat(host("LaunchAgents", XPROTECT.map((s) => s.replace(".daemon.", ".agent.")), `gui/${uid}`));
    const savedDevices = Object.keys(state).filter((key) => key.startsWith("sim:")).map((key) => key.split(":")[1]!);
    if (savedDevices.some((id) => !UUID.test(id))) throw new Error("Invalid VM profile device state");
    const ids = [...new Set([...devices, ...savedDevices])];
    if (ids.length) {
      const inventory = JSON.parse(run("xcrun", ["simctl", "list", "devices", "-j"]));
      const runtimes = JSON.parse(run("xcrun", ["simctl", "list", "runtimes", "-j"])).runtimes;
      for (const id of ids) {
        const runtimeId = Object.keys(inventory.devices).find((key) => inventory.devices[key].some((d: { udid: string }) => d.udid === id));
        if (!runtimeId && !devices.includes(id)) {
          for (const key of Object.keys(state)) if (key.startsWith(`sim:${id}:`)) delete state[key];
          save(state); continue; // Deleted devices have no launchd overrides left to restore.
        }
        const runtime = runtimes.find((r: { identifier: string }) => r.identifier === runtimeId);
        if (!runtime?.bundlePath?.startsWith("/")) throw new Error(`VM profile cannot resolve runtime for ${id}`);
        for (const label of LABELS) targets.push({ id: `sim:${id}:${label}`, device: id, label, domain: "user/foreground", plist: join(runtime.bundlePath, "Contents/Resources/RuntimeRoot/System/Library/LaunchDaemons", `${label}.plist`) });
      }
    }
    const byId = new Map(targets.map((t) => [t.id, t]));
    for (const [id, before] of Object.entries(state)) {
      if (!byId.has(id) || typeof before?.disabled !== "boolean" || typeof before?.loaded !== "boolean") throw new Error("Invalid VM profile service state");
    }
    const ctl = (t: Target, ...args: string[]) => t.device
      ? run("xcrun", ["simctl", "spawn", t.device, "launchctl", ...args])
      : run("/usr/bin/sudo", ["-n", "/bin/launchctl", ...args]);
    const loaded = (t: Target) => {
      try { ctl(t, "print", `${t.domain}/${t.label}`); return true; }
      catch (error) {
        // 113 is launchctl's absent-service result. Permission/timeouts are not proof of absence.
        if ((error as { status?: number }).status === 113) return false;
        throw error;
      }
    };
    const disabled = (t: Target) => ctl(t, "print-disabled", t.domain).split("\n").some((line) => line.trim() === `"${t.label}" => disabled`);
    const restore = (t: Target, before: Before) => {
      ctl(t, "enable", `${t.domain}/${t.label}`);
      if (before.loaded && !loaded(t)) ctl(t, "bootstrap", t.domain, t.plist);
      if (before.disabled) ctl(t, "disable", `${t.domain}/${t.label}`);
      if (disabled(t) !== before.disabled || (before.loaded && !loaded(t))) throw new Error(`VM profile restore failed: ${t.id}`);
      delete state[t.id]; save(state);
    };
    const changed: string[] = [];
    if (!enabled) {
      const errors: string[] = [];
      for (const id of Object.keys(state).reverse()) {
        try { restore(byId.get(id)!, state[id]!); changed.push(id); }
        catch (error) { errors.push(`${id}: ${error instanceof Error ? error.message : error}`); }
      }
      if (errors.length) throw new Error(errors.join("\n"));
      return { restored: changed };
    }
    const added: string[] = [];
    try {
      let xprotectBlocked: string | undefined;
      const apply = (t: Target) => {
        if (!present(t.plist)) return;
        if (!state[t.id]) {
          state[t.id] = { disabled: disabled(t), loaded: loaded(t) };
          save(state); added.push(t.id);
        }
        ctl(t, "disable", `${t.domain}/${t.label}`);
        if (loaded(t)) ctl(t, "bootout", `${t.domain}/${t.label}`);
        if (!disabled(t) || loaded(t)) throw new Error(`VM profile did not stop ${t.id}`);
        changed.push(t.id);
      };
      try {
        for (const t of targets.filter((t) => !t.device)) apply(t);
        // Stopping a launcher is insufficient if scanner children are still running.
        const scanners = run("/bin/ps", ["-axo", "comm="]).split("\n").filter((s) => /^\/Library\/Apple\/System\/Library\/CoreServices\/XProtect\.app\/Contents\/(?:MacOS\/(?:XProtect|XProtectRemediator[^/]+)|XPCServices\/XProtectPluginService\.xpc\/Contents\/MacOS\/XProtectPluginService)$/.test(s.trim()));
        if (scanners.length) throw new Error(`VM profile left active XProtect scanners: ${scanners.join(", ")}`);
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("System Integrity Protection is engaged")) throw error;
        // SIP-protected hosted images retain XProtect. Undo host changes before tuning devices.
        for (const id of [...added].reverse()) {
          restore(byId.get(id)!, state[id]!);
          added.splice(added.indexOf(id), 1);
        }
        changed.length = 0;
        xprotectBlocked = "System Integrity Protection is engaged; XProtect remains enabled";
      }
      for (const t of targets.filter((t) => t.device && devices.includes(t.device))) apply(t);
      return { disabled: changed, xprotectBlocked, restore: "serve-sim vm-profile off" };
    } catch (error) {
      const failures: string[] = [];
      for (const id of added.reverse()) {
        try { restore(byId.get(id)!, state[id]!); }
        catch { failures.push(id); }
      }
      throw new Error(`${error instanceof Error ? error.message : error}${failures.length ? `; restore pending for ${failures.join(", ")}: serve-sim vm-profile off` : ""}`);
    }
  } finally { rmSync(lock, { recursive: true }); }
}
