import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { parseCliOptions } from "../cli/options";
import { configureClientShell } from "../client-shell";
import {
  filterSessionDevices,
  isSessionDevice,
  parseSingleDevice,
  sessionEmuRequest,
  refuseSingleDeviceSocket,
} from "../single-device";

const ID = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";

describe("single-device sessions", () => {
  test("a refused socket cannot crash the host with a late protocol error", () => {
    const socket = new EventEmitter() as EventEmitter & { close(): void };
    let closed = false;
    socket.close = () => {
      closed = true;
    };
    refuseSingleDeviceSocket(socket);
    expect(closed).toBe(true);
    expect(() => socket.emit("error", new Error("Invalid WebSocket frame"))).not.toThrow();
  });
  test("requires an explicit platform and concrete device ID", () => {
    expect(() => parseCliOptions(["--single-device", ID])).toThrow("--platform");
    expect(() => parseCliOptions(["--platform", "ios", "--single-device", "booted"])).toThrow(
      "UDID",
    );
    expect(
      parseCliOptions(["--platform", "ios", "--single-device", ID.toLowerCase()]).singleDevice,
    ).toBe(ID);
    expect(
      parseCliOptions(["--platform", "android", "--single-device", "emulator-5554"]).singleDevice,
    ).toBe("emulator-5554");
  });

  test("discovery and shell use only the startup identity", () => {
    const policy = parseSingleDevice(ID, "ios")!;
    const device = { platform: "ios", id: ID } as any;
    const filtered = filterSessionDevices(
      {
        simulators: [device, { ...device, id: "other" }],
        emulators: [{ platform: "android", id: ID } as any],
      },
      policy,
    );
    expect(filtered.simulators).toEqual([device]);
    expect(filtered.emulators).toEqual([]);
    expect(isSessionDevice(policy, "android", ID)).toBe(false);
    expect(configureClientShell("{{singleDevice}}", "", "ios", undefined, false, false, ID)).toBe(
      ID,
    );
  });

  test("Android query defaults cannot select another device or call fleet actions", () => {
    const policy = parseSingleDevice("emulator-5554", "android")!;
    const scoped = sessionEmuRequest(
      new Request("http://localhost/vendor/serve-emu/api/screenshot"),
      policy,
    )!;
    expect(new URL(scoped.url).searchParams.get("device")).toBe("emulator-5554");
    for (const path of [
      "/api/devices",
      "/api/devices/select",
      "/api/device-grid",
      "/api/avds/start",
      "/api/avds/stop",
      "/api?device=other",
      "/api?device=emulator-5554&device=other",
    ]) {
      expect(
        sessionEmuRequest(new Request(`http://localhost/vendor/serve-emu${path}`), policy),
      ).toBeNull();
    }
    expect(
      sessionEmuRequest(new Request("http://localhost/api"), parseSingleDevice(ID, "ios")),
    ).toBeNull();
  });
});
