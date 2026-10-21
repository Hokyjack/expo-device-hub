import { type ComponentType, type CSSProperties, type PointerEvent } from "react";
import {
  type DeviceChrome,
  type DevicePlatform,
  type HardwareButton,
  type HardwareButtonPhase,
} from "@expo/hub-client";

import {
  BellOffIcon,
  CircleDotIcon,
  HomeIcon,
  icon as iconColor,
  LockIcon,
  PowerIcon,
  text,
  VolumeDownIcon,
  VolumeUpIcon,
} from "../primitives";
import { type DeviceFrameRect } from "./deviceFrame";

// Hardware button icons beside the device frame, as Apple's Device Hub and serve-sim's preview
// show them: hidden until the pointer is on a button's area, then only that edge's icons fade
// and slide in, with the hovered one accented. Each button's area covers the button and the
// strip outside the frame where its icon sits, and pressing anywhere in it holds the button.

export type FrameEdge = "top" | "right" | "bottom" | "left";

export type FrameButton = {
  /** Stable id within one frame; DeviceKit input names for iOS. */
  key: string;
  button: HardwareButton;
  /** The button's rect in the frame's portrait coordinates. */
  rect: DeviceFrameRect;
};

/** Hover and press state shared by the button areas and the DeviceKit sprites. */
export type FrameButtonActivity = { hovered: string | null; pressed: string | null };

export const NO_FRAME_BUTTON_ACTIVITY: FrameButtonActivity = { hovered: null, pressed: null };

// DeviceKit chrome.json input names that hub-client can press.
const DEVICEKIT_BUTTONS: Record<string, HardwareButton> = {
  power: "power",
  "volume-up": "volumeUp",
  "volume-down": "volumeDown",
  action: "action",
  mute: "ringer",
  home: "home",
};

/** The pressable buttons of a DeviceKit chrome. */
export function deviceKitFrameButtons(chrome: DeviceChrome): FrameButton[] {
  return chrome.buttons.flatMap((button) => {
    const mapped = DEVICEKIT_BUTTONS[button.name];
    return mapped && button.usagePage != null && button.usage != null
      ? [{ key: button.name, button: mapped, rect: button.frame }]
      : [];
  });
}

/** The frame edge nearest a button, which its icon sits beyond. */
export function frameButtonEdge(
  frame: { width: number; height: number },
  rect: DeviceFrameRect,
): FrameEdge {
  const distances: Array<[FrameEdge, number]> = [
    ["left", rect.x],
    ["right", frame.width - rect.x - rect.width],
    ["top", rect.y],
    ["bottom", frame.height - rect.y - rect.height],
  ];
  return distances.reduce((nearest, entry) => (entry[1] < nearest[1] ? entry : nearest))[0];
}

const GLYPH_GAP_PX = 10;
const GLYPH_SIZE_PX = 16;
/** How far an icon reaches past the frame; the panel keeps this much room around it. */
export const FRAME_BUTTON_REACH_PX = GLYPH_GAP_PX + GLYPH_SIZE_PX;
const GLYPH_SLIDE_PX = 6;
const AREA_SLACK_PX = 12;
/** The bezel cap's slide-out timing; the icons fade and slide on the same curve. */
export const FRAME_BUTTON_TRANSITION = "0.12s ease";

const ICONS: Record<HardwareButton, ComponentType<{ size?: number; color?: string }> | null> = {
  power: LockIcon,
  volumeUp: VolumeUpIcon,
  volumeDown: VolumeDownIcon,
  action: CircleDotIcon,
  ringer: BellOffIcon,
  home: HomeIcon,
  back: null,
  recents: null,
  appSwitcher: null,
  hideKeyboard: null,
};

const LABELS: Partial<Record<HardwareButton, string>> = {
  power: "Lock",
  volumeUp: "Volume Up",
  volumeDown: "Volume Down",
  action: "Action",
  ringer: "Ring/Silent",
  home: "Home",
};

function iconFor(button: HardwareButton, platform: DevicePlatform) {
  // Device Hub shows a lock beside an iPhone's side button; Android names it Power.
  if (button === "power" && platform === "android") return { Icon: PowerIcon, label: "Power" };
  const Icon = ICONS[button];
  return Icon ? { Icon, label: LABELS[button] ?? button } : null;
}

function percent(value: number, total: number): string {
  return `${((value / total) * 100).toFixed(4)}%`;
}

/**
 * Button areas and icons for one frame, drawn in its rotated artwork box so they follow the
 * device. The icons turn back upright inside that box.
 */
export function FrameButtonLayer({
  frame,
  buttons,
  platform,
  rotation,
  style,
  activity,
  onActivity,
  onPress,
}: {
  frame: { width: number; height: number };
  buttons: ReadonlyArray<FrameButton>;
  platform: DevicePlatform;
  rotation: number;
  style: CSSProperties;
  activity: FrameButtonActivity;
  onActivity: (update: (current: FrameButtonActivity) => FrameButtonActivity) => void;
  onPress: (button: HardwareButton, phase: HardwareButtonPhase) => void;
}) {
  const pressable = buttons.filter((entry) => iconFor(entry.button, platform));
  if (!pressable.length) return null;
  const activeKey = activity.pressed ?? activity.hovered;
  const activeEntry = pressable.find((entry) => entry.key === activeKey);
  const shownEdge = activeEntry ? frameButtonEdge(frame, activeEntry.rect) : null;

  return (
    <div data-frame-buttons="" style={{ ...style, pointerEvents: "none" }}>
      {pressable.map((entry) => {
        const edge = frameButtonEdge(frame, entry.rect);
        const { Icon, label } = iconFor(entry.button, platform)!;
        const release = () => {
          onActivity((current) =>
            current.pressed === entry.key ? { ...current, pressed: null } : current,
          );
          if (activity.pressed === entry.key) onPress(entry.button, "up");
        };
        return (
          <div key={entry.key}>
            <div
              data-hardware-button={entry.key}
              role="button"
              aria-label={label}
              title={label}
              style={{ ...areaStyle(frame, entry.rect, edge), position: "absolute" }}
              onPointerEnter={() => onActivity((current) => ({ ...current, hovered: entry.key }))}
              onPointerLeave={() => {
                onActivity((current) =>
                  current.hovered === entry.key ? { ...current, hovered: null } : current,
                );
              }}
              onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
                if (event.button !== 0 && event.pointerType === "mouse") return;
                event.preventDefault();
                event.stopPropagation();
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {}
                onActivity((current) => ({ ...current, pressed: entry.key }));
                onPress(entry.button, "down");
              }}
              onPointerUp={release}
              onPointerCancel={release}
            />
            <ButtonIcon
              id={entry.key}
              Icon={Icon}
              frame={frame}
              rect={entry.rect}
              edge={edge}
              rotation={rotation}
              shown={shownEdge === edge}
              active={entry.key === activeKey}
            />
          </div>
        );
      })}
    </div>
  );
}

/** From the button's inner edge out past its icon, slightly longer than the button. */
function areaStyle(
  frame: { width: number; height: number },
  rect: DeviceFrameRect,
  edge: FrameEdge,
): CSSProperties {
  const vertical = edge === "left" || edge === "right";
  const total = vertical ? frame.height : frame.width;
  const start = vertical ? rect.y : rect.x;
  const length = vertical ? rect.height : rect.width;
  const outward = FRAME_BUTTON_REACH_PX + AREA_SLACK_PX;
  const along: CSSProperties = vertical
    ? {
        top: `calc(${percent(start, total)} - ${AREA_SLACK_PX}px)`,
        height: `calc(${percent(length, total)} + ${2 * AREA_SLACK_PX}px)`,
      }
    : {
        left: `calc(${percent(start, total)} - ${AREA_SLACK_PX}px)`,
        width: `calc(${percent(length, total)} + ${2 * AREA_SLACK_PX}px)`,
      };
  const across: Record<FrameEdge, CSSProperties> = {
    left: {
      right: percent(frame.width - rect.x - rect.width, frame.width),
      width: `calc(${percent(rect.x + rect.width, frame.width)} + ${outward}px)`,
    },
    right: {
      left: percent(rect.x, frame.width),
      width: `calc(${percent(frame.width - rect.x, frame.width)} + ${outward}px)`,
    },
    top: {
      bottom: percent(frame.height - rect.y - rect.height, frame.height),
      height: `calc(${percent(rect.y + rect.height, frame.height)} + ${outward}px)`,
    },
    bottom: {
      top: percent(rect.y, frame.height),
      height: `calc(${percent(frame.height - rect.y, frame.height)} + ${outward}px)`,
    },
  };
  return {
    ...along,
    ...across[edge],
    cursor: "pointer",
    pointerEvents: "auto",
    touchAction: "none",
  };
}

function ButtonIcon({
  id,
  Icon,
  frame,
  rect,
  edge,
  rotation,
  shown,
  active,
}: {
  id: string;
  Icon: ComponentType<{ size?: number; color?: string }>;
  frame: { width: number; height: number };
  rect: DeviceFrameRect;
  edge: FrameEdge;
  rotation: number;
  shown: boolean;
  active: boolean;
}) {
  const outside = `calc(100% + ${GLYPH_GAP_PX}px)`;
  const alongY = percent(rect.y + rect.height / 2, frame.height);
  const alongX = percent(rect.x + rect.width / 2, frame.width);
  const s = GLYPH_SLIDE_PX;
  // Position, centering shift, and the hidden icon's offset toward the bezel.
  const placements: Record<FrameEdge, [CSSProperties, string, string]> = {
    left: [{ right: outside, top: alongY }, "translateY(-50%)", `translate(${s}px, 0px)`],
    right: [{ left: outside, top: alongY }, "translateY(-50%)", `translate(-${s}px, 0px)`],
    top: [{ bottom: outside, left: alongX }, "translateX(-50%)", `translate(0px, ${s}px)`],
    bottom: [{ top: outside, left: alongX }, "translateX(-50%)", `translate(0px, -${s}px)`],
  };
  const [place, shift, tuck] = placements[edge];
  return (
    <div
      data-hardware-button-icon={id}
      aria-hidden="true"
      style={{
        ...place,
        position: "absolute",
        width: GLYPH_SIZE_PX,
        height: GLYPH_SIZE_PX,
        display: "flex",
        color: active ? text.link : iconColor.secondary,
        opacity: shown ? 1 : 0,
        transform: shown ? shift : `${shift} ${tuck}`,
        transition: `color ${FRAME_BUTTON_TRANSITION}, opacity ${FRAME_BUTTON_TRANSITION}, transform ${FRAME_BUTTON_TRANSITION}`,
        pointerEvents: "none",
      }}
    >
      {/* The slide animates in artwork coordinates; turning upright must not animate. */}
      <div
        style={
          rotation ? { display: "flex", transform: `rotate(${-rotation}deg)` } : { display: "flex" }
        }
      >
        <Icon size={GLYPH_SIZE_PX} />
      </div>
    </div>
  );
}
