import { afterEach, expect, test } from "bun:test";
import {
  type DeviceChrome,
  type DeviceClient,
  type HardwareButton,
  type HardwareButtonPhase,
} from "@expo/hub-client";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import { PhoneFrame } from "../dashboard/PhoneFrame";
import { type Device } from "../dashboard/data";
import { type DeviceFrameAssets } from "../dashboard/deviceFrame";
import { deviceKitFrameButtons, frameButtonEdge } from "../dashboard/hardwareButtons";

let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(async () => renderer?.unmount());
  renderer = undefined;
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IPHONE: Device = {
  id: "ios",
  name: "iPhone 17 Pro",
  platform: "ios",
  version: "27.0",
  booted: true,
  physical: false,
  deviceFrame: null,
  supported: true,
};
const PIXEL: Device = {
  ...IPHONE,
  id: "android",
  name: "Pixel 9",
  platform: "android",
  deviceFrame: "android:pixel-9",
};

const button = (
  name: string,
  frame: { x: number; y: number; width: number; height: number },
  usage: number | null = 1,
) => ({
  name,
  image: `${name} BTN`,
  imageDown: `${name} BTN Dn`,
  onTop: false,
  frame,
  hover: { x: 0.3, y: 0 },
  usagePage: usage === null ? null : 12,
  usage,
});

function chrome(): DeviceChrome {
  return {
    identifier: "phone11",
    frame: { width: 1000, height: 2000 },
    body: { x: 10, y: 20, width: 980, height: 1960 },
    screen: { x: 60, y: 80, width: 880, height: 1840 },
    screenRadius: 100,
    compositeImage: "PhoneComposite",
    slice: null,
    corner: null,
    buttons: [
      button("action", { x: 0, y: 300, width: 14, height: 60 }),
      button("volume-up", { x: 0, y: 400, width: 14, height: 100 }),
      button("power", { x: 986, y: 500, width: 14, height: 200 }),
      button("digital-crown", { x: 986, y: 900, width: 14, height: 100 }),
      button("ringer-decoration", { x: 986, y: 1200, width: 14, height: 100 }, null),
    ],
    assetUrl: (image) => `/chrome?image=${encodeURIComponent(image)}`,
  };
}

const PIXEL_ASSETS = {
  "android:pixel-9": {
    src: "/pixel.png",
    width: 1000,
    height: 2000,
    screen: { x: 50, y: 50, width: 900, height: 1900 },
    screenRadius: 80,
    buttons: [
      { button: "power", rect: { x: 990, y: 500, width: 10, height: 150 } },
      { button: "volumeUp", rect: { x: 990, y: 800, width: 10, height: 140 } },
      { button: "volumeDown", rect: { x: 990, y: 940, width: 10, height: 140 } },
    ],
  },
} as unknown as DeviceFrameAssets;

async function render(
  device: Device,
  deviceChrome: DeviceChrome | null,
  assets?: DeviceFrameAssets,
) {
  const presses: string[] = [];
  const client = {
    status: "streaming",
    inputError: null,
    screen: null,
    deviceChrome,
    pressButton: (name: HardwareButton, phase?: HardwareButtonPhase) =>
      presses.push(`${name}:${phase ?? "press"}`),
  } as unknown as DeviceClient;
  await act(async () => {
    renderer = create(
      <PhoneFrame
        device={device}
        client={client}
        DeviceScreen={() => null}
        displayScreen={() => null}
        deviceFrameAssets={assets}
      />,
      { createNodeMock: () => ({ setPointerCapture() {}, releasePointerCapture() {} }) },
    );
  });
  return presses;
}

const host = (predicate: (props: Record<string, unknown>) => boolean) =>
  renderer!.root.findAll(
    (node) => typeof node.type === "string" && predicate(node.props as Record<string, unknown>),
  );
const zone = (key: string): ReactTestInstance =>
  host((props) => props["data-hardware-button"] === key)[0]!;
const shownIcons = () =>
  host(
    (props) =>
      "data-hardware-button-icon" in props && (props.style as { opacity: number }).opacity === 1,
  )
    .map((node) => node.props["data-hardware-button-icon"])
    .sort();
const pointer = (handler: unknown, event: object = {}) =>
  act(async () =>
    (handler as (event: object) => void)({
      button: 0,
      pointerType: "mouse",
      pointerId: 1,
      preventDefault() {},
      stopPropagation() {},
      currentTarget: { setPointerCapture() {}, releasePointerCapture() {} },
      ...event,
    }),
  );

test("DeviceKit buttons map to hub-client buttons; unknown or code-less inputs are skipped", () => {
  expect(deviceKitFrameButtons(chrome()).map((entry) => [entry.key, entry.button])).toEqual([
    ["action", "action"],
    ["volume-up", "volumeUp"],
    ["power", "power"],
  ]);
  expect(
    frameButtonEdge({ width: 1000, height: 2000 }, { x: 0, y: 400, width: 14, height: 100 }),
  ).toBe("left");
  expect(
    frameButtonEdge({ width: 1000, height: 2000 }, { x: 450, y: 1850, width: 100, height: 100 }),
  ).toBe("bottom");
});

test("an iOS button area reveals its edge, slides its cap, and holds the button", async () => {
  const presses = await render(IPHONE, chrome());
  expect(shownIcons()).toEqual([]);
  expect(zone("power").props).toMatchObject({ role: "button", "aria-label": "Lock" });
  await pointer(zone("power").props.onPointerEnter);
  expect(shownIcons()).toEqual(["power"]);
  // The cap sprite behind the bezel slides out by its rollover travel.
  const sprite = host((props) => props.src === "/chrome?image=power%20BTN")[0]!;
  expect(String((sprite.parent!.props.style as { transform?: string }).transform)).toBe(
    "translate(30%, 0%)",
  );
  await pointer(zone("power").props.onPointerDown);
  expect(host((props) => props.src === "/chrome?image=power%20BTN%20Dn")).toHaveLength(1);
  await pointer(zone("power").props.onPointerUp);
  expect(presses).toEqual(["power:down", "power:up"]);
  await pointer(zone("power").props.onPointerLeave);
  expect(shownIcons()).toEqual([]);
});

test("the left edge shows only its own icons, with the hovered one accented", async () => {
  await render(IPHONE, chrome());
  await pointer(zone("volume-up").props.onPointerEnter);
  expect(shownIcons()).toEqual(["action", "volume-up"]);
  const icon = (key: string) =>
    host((props) => props["data-hardware-button-icon"] === key)[0]!.props.style as {
      color: string;
    };
  expect(icon("volume-up").color).not.toBe(icon("action").color);
});

test("Android Pixel frames get the measured buttons with the same behavior", async () => {
  const presses = await render(PIXEL, null, PIXEL_ASSETS);
  expect(zone("volumeUp").props).toMatchObject({ role: "button", "aria-label": "Volume Up" });
  await pointer(zone("volumeDown").props.onPointerEnter);
  expect(shownIcons()).toEqual(["power", "volumeDown", "volumeUp"]);
  await pointer(zone("volumeDown").props.onPointerDown);
  await pointer(zone("volumeDown").props.onPointerCancel);
  expect(presses).toEqual(["volumeDown:down", "volumeDown:up"]);
});

test("no frame means no button areas", async () => {
  await render({ ...PIXEL, deviceFrame: null }, null, PIXEL_ASSETS);
  expect(host((props) => "data-hardware-button" in props)).toEqual([]);
});
