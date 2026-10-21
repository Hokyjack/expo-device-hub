import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import {
  DeviceKitChrome,
  deviceKitChromeForScreen,
  deviceKitChromeGeometry,
  deviceKitGlyphEdges,
  deviceKitScreenRadius,
  snapChromeRect,
} from "../client/components/device-chrome-frame";
import type { DeviceKitChromeDescriptor } from "../client/utils/grid";
import type { SimulatorOrientation } from "../client/types";

function chromeFixture(): DeviceKitChromeDescriptor {
  return {
    identifier: "test",
    frame: { width: 1000, height: 2000 },
    body: { x: 10, y: 20, width: 980, height: 1960 },
    screen: { x: 40, y: 80, width: 920, height: 1840 },
    insets: { top: 10, left: 10, bottom: 10, right: 10 },
    outerCornerRadius: 16,
    innerCornerRadius: 12,
    screenRadius: 10,
    compositeImage: "Composite",
    slice: null,
    corner: null,
    buttons: [],
  };
}

describe("deviceKitChromeGeometry", () => {
  const chrome = { ...chromeFixture(), screen: { x: 40, y: 80, width: 300, height: 700 } };
  const cases: Array<{
    orientation: SimulatorOrientation;
    frame: { width: number; height: number };
    screen: { x: number; y: number; width: number; height: number };
  }> = [
    {
      orientation: "portrait",
      frame: { width: 1000, height: 2000 },
      screen: { x: 40, y: 80, width: 300, height: 700 },
    },
    {
      orientation: "landscape_left",
      frame: { width: 2000, height: 1000 },
      screen: { x: 1220, y: 40, width: 700, height: 300 },
    },
    {
      orientation: "portrait_upside_down",
      frame: { width: 1000, height: 2000 },
      screen: { x: 660, y: 1220, width: 300, height: 700 },
    },
    {
      orientation: "landscape_right",
      frame: { width: 2000, height: 1000 },
      screen: { x: 80, y: 660, width: 700, height: 300 },
    },
  ];

  for (const { orientation, frame, screen } of cases) {
    test(`rotates asymmetric screen bounds for ${orientation}`, () => {
      expect(deviceKitChromeGeometry(chrome, orientation)).toEqual({ frame, screen });
    });
  }

  test("defaults to the original portrait geometry without changing the descriptor", () => {
    expect(deviceKitChromeGeometry(chrome)).toEqual({ frame: chrome.frame, screen: chrome.screen });
    expect(chrome.screen).toEqual({ x: 40, y: 80, width: 300, height: 700 });
  });
});

describe("oriented DeviceKitChrome", () => {
  const chrome = {
    ...chromeFixture(),
    screen: { x: 40, y: 80, width: 300, height: 700 },
    screenCornerRadii: { topLeft: 10, topRight: 20, bottomRight: 30, bottomLeft: 40 },
  };

  const cases: Array<{
    orientation: SimulatorOrientation;
    container: { width: number; height: number };
    screenStyle: string;
    angle: number;
  }> = [
    {
      orientation: "portrait",
      container: { width: 300, height: 600 },
      screenStyle: "left:12px;top:24px;width:90px;height:210px",
      angle: 0,
    },
    {
      orientation: "landscape_left",
      container: { width: 600, height: 300 },
      screenStyle: "left:366px;top:12px;width:210px;height:90px",
      angle: 90,
    },
    {
      orientation: "portrait_upside_down",
      container: { width: 300, height: 600 },
      screenStyle: "left:198px;top:366px;width:90px;height:210px",
      angle: 180,
    },
    {
      orientation: "landscape_right",
      container: { width: 600, height: 300 },
      screenStyle: "left:24px;top:198px;width:210px;height:90px",
      angle: -90,
    },
  ];

  for (const { orientation, container, screenStyle, angle } of cases) {
    test(`keeps the live screen axis-aligned while rotating ${orientation} artwork`, () => {
      const markup = renderToStaticMarkup(
        createElement(DeviceKitChrome, {
          chrome,
          orientation,
          containerSize: container,
          screen: createElement("canvas", { "data-live-screen": "true" }),
        }),
      );
      const screen = markup.match(
        /<div[^>]*data-devicekit-screen=""[^>]*style="([^"]+)"[^>]*>(.*?)<\/div>/,
      );
      expect(screen?.[1]).toContain(screenStyle);
      expect(screen?.[1]).toContain(`border-radius:${deviceKitScreenRadius(chrome, orientation)}`);
      expect(screen?.[1]).toContain("pointer-events:auto");
      expect(screen?.[1]).not.toContain("transform");
      expect(screen?.[2]).toContain('data-live-screen="true"');
      // These are portrait-artwork coordinates, using the swapped container
      // dimensions in landscape so the bezel still meets the screen cutout.
      expect(markup).toContain("left:3px;top:6px;width:294px;height:588px");
      if (angle) expect(markup).toContain(`transform:translate(-50%, -50%) rotate(${angle}deg)`);
      else expect(markup).not.toContain("rotate(");
    });
  }

  test("keeps front hardware buttons above the screen and rear buttons behind the bezel", () => {
    const buttons: DeviceKitChromeDescriptor["buttons"] = [false, true].map((onTop) => ({
      name: onTop ? "digital-crown" : "volume-up",
      image: onTop ? "Crown" : "Volume",
      imageDown: null,
      onTop,
      frame: { x: 980, y: 200, width: 20, height: 60 },
      hover: { x: 0.2, y: 0 },
      usagePage: 12,
      usage: 1,
    }));
    const markup = renderToStaticMarkup(
      createElement(DeviceKitChrome, {
        chrome: { ...chrome, buttons },
        orientation: "landscape_left",
        interactive: true,
        screen: createElement("canvas", { "data-live-screen": "true" }),
      }),
    );
    const back = markup.indexOf('data-devicekit-artwork="back"');
    const screen = markup.indexOf('data-devicekit-screen=""');
    const front = markup.indexOf('data-devicekit-artwork="front"');
    expect(back).toBeLessThan(screen);
    expect(front).toBeGreaterThan(screen);
    expect(markup.slice(back, screen)).toContain('aria-label="Volume Up"');
    expect(markup.slice(back, screen)).not.toContain('aria-label="Digital Crown"');
    expect(markup.slice(front)).toContain('aria-label="Digital Crown"');
    expect(markup.slice(front)).toContain("z-index:5");
    expect(markup.slice(front)).toContain("pointer-events:none");
    expect(markup.slice(front)).toContain("pointer-events:auto");
  });

  test("preserves percentage layout for portrait placeholders", () => {
    const markup = renderToStaticMarkup(createElement(DeviceKitChrome, { chrome }));
    expect(markup).toContain("left:4%;top:4%;width:30%;height:35%");
    expect(markup).not.toContain("rotate(");
    expect(markup).not.toContain('role="button"');
  });
});

describe("hardware button glyphs", () => {
  // Body spans x 10..990 and y 20..1980 in a 1000x2000 frame.
  const button = (
    name: string,
    frame: { x: number; y: number; width: number; height: number },
    usage: number | null = 1,
  ): DeviceKitChromeDescriptor["buttons"][number] => ({
    name,
    image: name,
    imageDown: null,
    onTop: false,
    frame,
    hover: { x: 0, y: 0 },
    usagePage: usage === null ? null : 12,
    usage,
  });
  const volumeUp = button("volume-up", { x: 0, y: 400, width: 14, height: 100 });
  const power = button("power", { x: 986, y: 500, width: 14, height: 200 });
  const action = button("action", { x: 986, y: 900, width: 14, height: 100 });
  // A face button inside the bezel, like iPhone SE's Home button.
  const home = button("home", { x: 450, y: 1850, width: 100, height: 100 });

  type Renderer = ReturnType<typeof create>;
  async function render(props: Parameters<typeof DeviceKitChrome>[0]): Promise<Renderer> {
    let renderer!: Renderer;
    await act(async () => {
      renderer = create(createElement(DeviceKitChrome, props), {
        createNodeMock: () => ({ addEventListener() {}, removeEventListener() {} }),
      });
    });
    return renderer;
  }
  const glyphs = (renderer: Renderer) =>
    renderer.root
      .findAll((node) => typeof node.type === "string" && "data-devicekit-glyph" in node.props)
      .map((node) => node.props as Record<string, unknown> & { style: Record<string, unknown> });
  const glyph = (renderer: Renderer, name: string) =>
    glyphs(renderer).find((props) => props["data-devicekit-glyph"] === name);
  // Hidden icons stay mounted so they can fade and slide in, like Device Hub's.
  const glyphNames = (renderer: Renderer) =>
    glyphs(renderer)
      .filter((props) => props.style.opacity === 1)
      .map((props) => props["data-devicekit-glyph"])
      .sort();
  const zone = (renderer: Renderer, edge: string) =>
    renderer.root.find(
      (node) => typeof node.type === "string" && node.props["data-devicekit-edge"] === edge,
    ).props as { onPointerEnter: () => void; onPointerLeave: () => void };
  async function pointer(handler: () => void) {
    await act(async () => handler());
  }

  test("hides every icon until the pointer reaches an edge, then shows only that edge", async () => {
    const renderer = await render({
      chrome: { ...chromeFixture(), buttons: [volumeUp, power, action] },
      interactive: true,
    });
    expect(glyphNames(renderer)).toEqual([]);
    await pointer(zone(renderer, "right").onPointerEnter);
    expect(glyphNames(renderer)).toEqual(["action", "power"]);
    await pointer(zone(renderer, "right").onPointerLeave);
    await pointer(zone(renderer, "left").onPointerEnter);
    expect(glyphNames(renderer)).toEqual(["volume-up"]);
  });

  test("hovering a bezel button shows its edge and highlights only that icon", async () => {
    const renderer = await render({
      chrome: { ...chromeFixture(), buttons: [volumeUp, power, action] },
      interactive: true,
    });
    const cap = renderer.root.find(
      (node) => typeof node.type === "string" && node.props["aria-label"] === "Power",
    ).props as { onPointerEnter: () => void };
    await pointer(cap.onPointerEnter);
    expect(glyphNames(renderer)).toEqual(["action", "power"]);
    expect(glyph(renderer, "power")!.className).toContain("text-accent");
    expect(glyph(renderer, "action")!.className).not.toContain("text-accent");
  });

  test("hides the icons shortly after the pointer leaves", async () => {
    const renderer = await render({
      chrome: { ...chromeFixture(), buttons: [power] },
      interactive: true,
    });
    await pointer(zone(renderer, "right").onPointerEnter);
    await pointer(zone(renderer, "right").onPointerLeave);
    // Moving from the zone onto the icon or the cap must not flicker.
    expect(glyphNames(renderer)).toEqual(["power"]);
    await act(async () => Bun.sleep(250));
    expect(glyphNames(renderer)).toEqual([]);
  });

  test("slides a hidden icon toward the bezel and out of pointer reach", async () => {
    const renderer = await render({
      chrome: { ...chromeFixture(), buttons: [volumeUp, power, home] },
      interactive: true,
    });
    expect(glyph(renderer, "power")!.style).toMatchObject({ opacity: 0, pointerEvents: "none" });
    expect(String(glyph(renderer, "power")!.style.transform)).toContain("translate(-6px, 0px)");
    expect(String(glyph(renderer, "volume-up")!.style.transform)).toContain("translate(6px, 0px)");
    expect(String(glyph(renderer, "home")!.style.transform)).toContain("translate(0px, -6px)");
    await pointer(zone(renderer, "right").onPointerEnter);
    expect(glyph(renderer, "power")!.style).toMatchObject({ opacity: 1, pointerEvents: "auto" });
    expect(String(glyph(renderer, "power")!.style.transform)).not.toContain("6px");
    expect(String(glyph(renderer, "power")!.style.transition)).toContain("opacity");
  });

  test("places each icon a fixed gap outside the frame edge its button is on", async () => {
    const renderer = await render({
      chrome: { ...chromeFixture(), buttons: [volumeUp, power, home] },
      interactive: true,
    });
    await pointer(zone(renderer, "left").onPointerEnter);
    expect(glyph(renderer, "volume-up")!.style).toMatchObject({
      right: "calc(100% + 10px)",
      top: "22.5%",
    });
    await pointer(zone(renderer, "right").onPointerEnter);
    expect(glyph(renderer, "power")!.style).toMatchObject({
      left: "calc(100% + 10px)",
      top: "30%",
    });
    await pointer(zone(renderer, "bottom").onPointerEnter);
    expect(glyph(renderer, "home")!.style).toMatchObject({
      top: "calc(100% + 10px)",
      left: "50%",
    });
    // The bezel button carries the accessible name; the icon only repeats it visually.
    expect(glyph(renderer, "home")).toMatchObject({ "aria-hidden": true, title: "Home" });
  });

  test("keeps icons upright while the artwork rotates", async () => {
    const renderer = await render({
      chrome: { ...chromeFixture(), buttons: [power] },
      interactive: true,
      orientation: "landscape_left",
    });
    await pointer(zone(renderer, "right").onPointerEnter);
    // The slide animates; the counter-rotation must not, or a rotation would tilt the icon.
    const outer = renderer.root.find(
      (node) => typeof node.type === "string" && node.props["data-devicekit-glyph"] === "power",
    );
    expect(String(outer.props.style.transform)).not.toContain("rotate");
    const upright = outer.find(
      (node) => typeof node.type === "string" && "data-devicekit-glyph-upright" in node.props,
    );
    expect(upright.props.style).toEqual({ transform: "rotate(-90deg)" });
  });

  test("reports the edges that carry icons in the current orientation", () => {
    const chrome = {
      ...chromeFixture(),
      buttons: [volumeUp, power, button("mystery", { x: 450, y: 1970, width: 100, height: 30 })],
    };
    const edges = (orientation: SimulatorOrientation) =>
      [...deviceKitGlyphEdges(chrome, orientation)].sort();
    expect(edges("portrait")).toEqual(["left", "right"]);
    // Artwork rotates 90° clockwise for landscape_left: left goes to the top.
    expect(edges("landscape_left")).toEqual(["bottom", "top"]);
    expect(edges("portrait_upside_down")).toEqual(["left", "right"]);
    expect([
      ...deviceKitGlyphEdges(
        { ...chrome, buttons: [button("home", { x: 450, y: 1970, width: 100, height: 30 })] },
        "landscape_right",
      ),
    ]).toEqual(["right"]);
  });

  test("turning the wheel over the Digital Crown icon turns the crown", async () => {
    const chrome = {
      ...chromeFixture(),
      buttons: [button("digital-crown", { x: 986, y: 500, width: 14, height: 200 })],
    };
    const wheel = new Map<string, (event: unknown) => void>();
    const turns: number[] = [];
    let renderer!: Renderer;
    await act(async () => {
      renderer = create(
        createElement(DeviceKitChrome, {
          chrome,
          interactive: true,
          onCrownWheel: (deltaY) => turns.push(deltaY),
        }),
        {
          createNodeMock: (element) => {
            const props = element.props as object;
            const kind =
              "data-devicekit-glyph" in props
                ? "glyph"
                : "data-devicekit-edge" in props
                  ? "zone"
                  : "cap";
            return {
              addEventListener: (type: string, handler: (event: unknown) => void) =>
                type === "wheel" && wheel.set(kind, handler),
              removeEventListener: (type: string) => type === "wheel" && wheel.delete(kind),
            };
          },
        },
      );
    });
    // The icon stays mounted, so it turns the crown as soon as hover reveals it.
    expect([...wheel.keys()].sort()).toEqual(["cap", "glyph"]);
    await pointer(zone(renderer, "right").onPointerEnter);
    let prevented = 0;
    wheel.get("glyph")!({
      deltaY: 3,
      deltaMode: 0,
      preventDefault: () => prevented++,
      stopPropagation: () => {},
    });
    expect(turns).toEqual([3]);
    expect(prevented).toBe(1);
  });

  test("the crown icon still turns the crown after presentation ends", async () => {
    const chrome = {
      ...chromeFixture(),
      buttons: [button("digital-crown", { x: 986, y: 500, width: 14, height: 200 })],
    };
    const listening = new Set<string>();
    const props = (showButtonGlyphs: boolean) => ({
      chrome,
      interactive: true,
      showButtonGlyphs,
      onCrownWheel: () => {},
    });
    let renderer!: Renderer;
    await act(async () => {
      renderer = create(createElement(DeviceKitChrome, props(false)), {
        createNodeMock: (element) => {
          const kind = "data-devicekit-glyph" in (element.props as object) ? "glyph" : "other";
          return {
            addEventListener: (type: string) => type === "wheel" && listening.add(kind),
            removeEventListener: (type: string) => type === "wheel" && listening.delete(kind),
          };
        },
      });
    });
    expect([...listening]).toEqual(["other"]);
    await act(async () => renderer.update(createElement(DeviceKitChrome, props(true))));
    expect([...listening].sort()).toEqual(["glyph", "other"]);
  });

  test("shows no icons or hover zones in full-screen presentation", async () => {
    const renderer = await render({
      chrome: { ...chromeFixture(), buttons: [power] },
      interactive: true,
      showButtonGlyphs: false,
    });
    expect(
      renderer.root.findAll(
        (node) => typeof node.type === "string" && "data-devicekit-edge" in node.props,
      ),
    ).toEqual([]);
    expect(glyphs(renderer)).toEqual([]);
  });

  test("shows no hover zone for placeholders, inputs without a HID code, or unknown names", () => {
    const chrome = {
      ...chromeFixture(),
      buttons: [
        button("power", { x: 986, y: 500, width: 14, height: 200 }, null),
        button("mystery", { x: 986, y: 800, width: 14, height: 200 }),
      ],
    };
    expect(
      renderToStaticMarkup(createElement(DeviceKitChrome, { chrome, interactive: true })),
    ).not.toContain("data-devicekit-edge");
    expect(
      renderToStaticMarkup(
        createElement(DeviceKitChrome, { chrome: { ...chrome, buttons: [power] } }),
      ),
    ).not.toContain("data-devicekit-edge");
  });
});

describe("deviceKitChromeForScreen", () => {
  test("selects the active screen's descriptor and falls back for unknown screens", () => {
    const inner = { ...chromeFixture(), identifier: "inner", screenId: 3 };
    const chrome = { ...chromeFixture(), screenId: 1, displayVariants: { 3: inner } };

    expect(deviceKitChromeForScreen(chrome, 3)).toBe(inner);
    expect(deviceKitChromeForScreen(chrome, 1)).toBe(chrome);
    expect(deviceKitChromeForScreen(chrome, 99)).toBe(chrome);
    expect(deviceKitChromeForScreen(chrome, undefined)).toBe(chrome);
    const legacy = chromeFixture();
    expect(deviceKitChromeForScreen(legacy, 3)).toBe(legacy);
  });
});

describe("deviceKitScreenRadius", () => {
  test("rotates asymmetric corners and their percentage axes with the display", () => {
    const chrome = {
      ...chromeFixture(),
      screen: { x: 40, y: 80, width: 200, height: 400 },
      screenCornerRadii: { topLeft: 10, topRight: 20, bottomRight: 30, bottomLeft: 40 },
    };

    expect(deviceKitScreenRadius(chrome, "landscape_left")).toBe(
      "10% 2.5% 5% 7.5% / 20% 5% 10% 15%",
    );
    expect(deviceKitScreenRadius(chrome, "landscape_right")).toBe(
      "5% 7.5% 10% 2.5% / 10% 15% 20% 5%",
    );
    expect(deviceKitScreenRadius(chrome, "portrait_upside_down")).toBe(
      "15% 20% 5% 10% / 7.5% 10% 2.5% 5%",
    );
    expect(deviceKitScreenRadius(chrome, "portrait")).toBe("5% 10% 15% 20% / 2.5% 5% 7.5% 10%");
  });

  test("preserves each corner in clockwise CSS order", () => {
    const chrome = {
      ...chromeFixture(),
      screen: { x: 40, y: 80, width: 200, height: 400 },
      screenCornerRadii: { topLeft: 10, topRight: 20, bottomRight: 30, bottomLeft: 0 },
    };

    expect(deviceKitScreenRadius(chrome)).toBe("5% 10% 15% 0% / 2.5% 5% 7.5% 0%");
  });

  test("keeps clipping proportional as the rendered screen scales", () => {
    const chrome: DeviceKitChromeDescriptor = {
      ...chromeFixture(),
      frame: { width: 200, height: 400 },
      screen: { x: 0, y: 0, width: 200, height: 400 },
      compositeImage: null,
      screenCornerRadii: { topLeft: 10, topRight: 20, bottomRight: 30, bottomLeft: 0 },
    };

    for (const containerSize of [
      { width: 100, height: 200 },
      { width: 200, height: 400 },
    ]) {
      const markup = renderToStaticMarkup(
        createElement(DeviceKitChrome, { chrome, containerSize }),
      );

      expect(markup).toContain(`width:${containerSize.width}px;height:${containerSize.height}px`);
      expect(markup).toContain("border-radius:5% 10% 15% 0% / 2.5% 5% 7.5% 0%");
    }
  });

  test("retains the scalar CSS format for legacy descriptors", () => {
    const chrome = {
      ...chromeFixture(),
      screen: { x: 40, y: 80, width: 200, height: 400 },
    };

    expect(deviceKitScreenRadius(chrome)).toBe("5% / 2.5%");
    expect(deviceKitScreenRadius(chrome, "landscape_left")).toBe("2.5% / 5%");
    expect(deviceKitScreenRadius(chrome, "landscape_right")).toBe("2.5% / 5%");
    expect(deviceKitScreenRadius(chrome, "portrait_upside_down")).toBe("5% / 2.5%");
  });
});

describe("snapChromeRect", () => {
  const chrome = chromeFixture();
  const container = { width: 401, height: 867 };

  for (const dpr of [1, 2, 3]) {
    test(`adjacent rects share an edge at dpr ${dpr}`, () => {
      const left = snapChromeRect(chrome, { x: 0, y: 0, width: 50, height: 100 }, container, dpr);
      const right = snapChromeRect(chrome, { x: 50, y: 0, width: 50, height: 100 }, container, dpr);

      expect(left.left + left.width).toBe(right.left);
    });

    test(`every edge lands on the device-pixel grid at dpr ${dpr}`, () => {
      const rect = snapChromeRect(chrome, { x: 37, y: 91, width: 53, height: 107 }, container, dpr);

      for (const edge of [rect.left, rect.top, rect.left + rect.width, rect.top + rect.height]) {
        expect(Number.isInteger(edge * dpr)).toBe(true);
      }
    });
  }

  test("stays inside the container and keeps sizes non-negative", () => {
    const frameRect = { x: 0, y: 0, width: chrome.frame.width, height: chrome.frame.height };
    const full = snapChromeRect(chrome, frameRect, container, 2);

    expect(full.left).toBe(0);
    expect(full.top).toBe(0);
    expect(full.width).toBe(container.width);
    expect(full.height).toBe(container.height);
  });

  test("a zero-width rect snaps to zero, never to a negative size", () => {
    const empty = snapChromeRect(chrome, { x: 500, y: 500, width: 0, height: 0 }, container, 2);

    expect(empty.width).toBe(0);
    expect(empty.height).toBe(0);
  });
});
