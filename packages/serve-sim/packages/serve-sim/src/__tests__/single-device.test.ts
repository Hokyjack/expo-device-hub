import { describe, expect, test } from "bun:test";
import { SingleDevicePolicy } from "../single-device";

const DEVICE = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA";
const OTHER = "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB";

describe("single-device policy", () => {
  test("requires a concrete simulator identity", () => {
    for (const id of ["booted", "all", "iPhone", ""]) {
      expect(() => new SingleDevicePolicy(id)).toThrow();
    }
  });

  test("defaults to the pinned device and normalizes UUID case", () => {
    const policy = new SingleDevicePolicy(DEVICE.toLowerCase());
    expect(policy.target()).toBe(DEVICE);
    expect(policy.target(DEVICE.toLowerCase())).toBe(DEVICE);
    for (const id of [OTHER, "booted", "all", "iPhone", ""]) {
      expect(() => policy.target(id)).toThrow("single-device");
    }
  });

  test("pins optional action targets and permits reboot of only that device", () => {
    const policy = new SingleDevicePolicy(DEVICE);
    expect(policy.action("button", { value: "home" })).toEqual({ value: "home", udid: DEVICE });
    expect(policy.action("capture.reboot", { udid: DEVICE, enabled: true })).toEqual({
      udid: DEVICE,
      enabled: true,
    });
    expect(() => policy.action("capture.reboot", { udid: OTHER })).toThrow();
    for (const action of ["server.detach", "server.kill", "home.watch"]) {
      expect(() => policy.action(action, {})).toThrow("single-device");
    }
  });
});
