import { beforeEach, describe, expect, mock, test } from "bun:test";

import { createElement, type DragEvent } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { UNSUPPORTED_INSTALL_FORMAT } from "../app-install-format";

const actions: string[] = [];
beforeEach(() => { actions.length = 0; });
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

void mock.module("../socket/client-control", () => ({
  runHostAction: async (action: string) => {
    actions.push(action);
    return { stdout: "", stderr: "", exitCode: 0 };
  },
}));

import { startHostPathDrop, useMediaDrop } from "../client/hooks/use-media-drop";

describe("startHostPathDrop", () => {
  test("dismisses the screenshot toast when a host screenshot path is dropped", async () => {
    const events: string[] = [];
    const done = startHostPathDrop({
      hostPath: "/Users/me/Desktop/serve-sim-screenshot.png",
      udid: "UDID",
      onUploadStart: (name, kind) => {
        events.push(`start:${name}:${kind}`);
        return "upload-1";
      },
      onUploadProgress: (id, progress) => {
        events.push(`progress:${id}:${String(progress)}`);
      },
      onUploadEnd: (id, ok) => {
        events.push(`end:${id}:${String(ok)}`);
      },
      onHostPathDrop: (path) => {
        events.push(`dismiss:${path}`);
      },
    });

    expect(events[0]).toBe("dismiss:/Users/me/Desktop/serve-sim-screenshot.png");
    expect(events[1]).toBe("start:serve-sim-screenshot.png:media");
    await done;
    expect(events).toContain("end:upload-1:true");
  });
});

// Drive the hook's actual drop event so classification cannot bypass the diagnostic.
test.each(["Build.zip", "BUILD.ZIP", "Device.ipa"])(
  "app archive drop reports Simulator-build guidance without upload: %s",
  async name => {
    const events: string[] = [];
    let drop: ReturnType<typeof useMediaDrop> | undefined;
    function Harness() {
      drop = useMediaDrop({
        enabled: true,
        udid: "UDID",
        onUploadStart: (name, kind) => {
          events.push(`start:${name}:${kind}`);
          return "upload-1";
        },
        onUploadProgress: () => { events.push("progress"); },
        onUploadEnd: (id, ok, message) => { events.push(`end:${id}:${ok}:${message}`); },
        onUnsupported: () => { events.push("generic unsupported"); },
      });
      return null;
    }
    let renderer: ReactTestRenderer | undefined;
    try {
      await act(async () => { renderer = create(createElement(Harness)); });
      await act(async () => {
        await drop!.dropZoneProps.onDrop({
          preventDefault() {},
          stopPropagation() {},
          dataTransfer: {
            getData: () => "",
            files: [new File(["archive"], name, { type: "application/zip" })],
          },
        } as unknown as DragEvent);
      });
      expect(events).toEqual([
        `start:${name}:media`,
        `end:upload-1:false:${UNSUPPORTED_INSTALL_FORMAT}`,
      ]);
      expect(actions).toEqual([]);
    } finally {
      await act(async () => { renderer?.unmount(); });
    }
  },
);
