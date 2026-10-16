import React from "react";
import { test, expect } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { DeviceClientProvider } from "../DeviceClientProvider";
import { useDeviceScreenClient } from "../useDeviceScreenClient";
import { DeviceScreen } from "../DeviceScreen";
import { createGlobalStubs } from "./test-globals";
const { stubGlobal, restoreGlobals } = createGlobalStubs();
test("provider harmless config refresh must preserve the active drag through real move and up", async () => {
  let renderer: ReactTestRenderer | undefined;
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  class Socket {
    static instances: Socket[] = [];
    readyState = 0;
    sent: Record<string, unknown>[] = [];
    onopen?: () => void;
    onmessage?: (e: { data: unknown }) => void;
    onclose?: () => void;
    constructor(public url: string) {
      Socket.instances.push(this);
    }
    send(data: string | ArrayBuffer) {
      this.sent.push(
        typeof data === "string"
          ? JSON.parse(data)
          : {
              tag: new Uint8Array(data)[0],
              ...JSON.parse(new TextDecoder().decode(new Uint8Array(data).slice(1))),
            },
      );
    }
    close() {
      this.readyState = 3;
      this.onclose?.();
    }
  }
  const config = {
    device: "DEVICE-A",
    pid: 1,
    url: "http://localhost:3200/sim/helper/DEVICE-A",
    wsUrl: "ws://localhost:3200/sim/helper/DEVICE-A/ws",
    inputAdmission: true,
    execToken: "test-token",
    streamSettings: { transport: "http", codec: "mjpeg", mjpegFps: 30 },
  };
  const surface = {
    focus() {},
    setPointerCapture() {},
    releasePointerCapture() {},
    addEventListener() {},
    removeEventListener() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 100, height: 200 };
    },
  };
  stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  stubGlobal("window", {
    location: {
      href: "http://localhost:3200/",
      origin: "http://localhost:3200",
      protocol: "http:",
      host: "localhost:3200",
    },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
  });
  stubGlobal("document", { hidden: false, addEventListener() {}, removeEventListener() {} });
  stubGlobal("WebSocket", Socket);
  stubGlobal(
    "EventSource",
    class {
      close() {}
    },
  );
  stubGlobal("fetch", async (url: string | URL | Request) =>
    new URL(String(url), "http://localhost:3200").pathname === "/sim/api"
      ? Response.json(config)
      : Response.json({ devices: [] }),
  );
  function Screen() {
    return <DeviceScreen client={useDeviceScreenClient()} />;
  }
  try {
    await act(async () => {
      renderer = create(
        <DeviceClientProvider
          platform="ios"
          options={{
            baseUrl: "http://localhost:3200/sim",
            device: "DEVICE-A",
            streamMode: "mjpeg",
          }}
        >
          <Screen />
        </DeviceClientProvider>,
        { createNodeMock: () => surface },
      );
    });
    const input = Socket.instances.find((s) => s.url.includes("/helper/"))!;
    const control = Socket.instances.find((s) => s.url.endsWith("/exec-ws"))!;
    await act(async () => {
      input.readyState = 1;
      input.onmessage?.({ data: Uint8Array.of(0x83).buffer });
      control.readyState = 1;
      control.onopen?.();
      control.onmessage?.({ data: JSON.stringify({ ready: true }) });
    });
    const application = renderer!.root.findByProps({ role: "application" });
    const pointer = {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      clientX: 20,
      clientY: 60,
      altKey: false,
      shiftKey: false,
      preventDefault() {},
      nativeEvent: {},
    };
    await act(async () => application.props.onPointerDown(pointer));
    const configSubscription = control.sent.find(
      (x) =>
        typeof x.sub === "number" && String(x.path ?? x.subscribe ?? "").includes("/api/events"),
    );
    const sub = configSubscription ?? control.sent.find((x) => typeof x.sub === "number");
    expect(sub).toBeDefined();
    await act(async () =>
      control.onmessage?.({
        data: JSON.stringify({
          sub: sub!.sub,
          data: `data: ${JSON.stringify({ ...config, streamSettings: { ...config.streamSettings, mjpegFps: 60 } })}\n\n`,
        }),
      }),
    );
    expect(input.sent.filter((x) => x.tag === 3).map((x) => x.type)).toEqual(["begin"]);
    expect(Socket.instances.filter((s) => s.url.includes("/helper/"))).toHaveLength(1);
    expect(input.readyState).toBe(1);
    await act(async () =>
      application.props.onPointerMove({ ...pointer, clientX: 40, clientY: 100 }),
    );
    await act(async () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    });
    await act(async () => application.props.onPointerUp({ ...pointer, clientX: 50, clientY: 120 }));
    const touches = input.sent.filter((x) => x.tag === 3);
    expect(touches.map((x) => x.type)).toEqual(["begin", "move", "end"]);
  } finally {
    if (renderer) await act(async () => renderer!.unmount());
    restoreGlobals();
  }
});
