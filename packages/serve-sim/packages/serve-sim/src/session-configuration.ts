import { z } from "zod";
import { execFileSync } from "child_process";
import { CAPTURE_FIELDS } from "./capture/fields";
import { parseCaptureProxy } from "./capture/upstream";
import { frameAncestorsPolicy } from "./middleware-utils";
import { MAX_MJPEG_STREAM_FPS, MAX_VIDEO_STREAM_FPS } from "./stream-settings";

const origin = z
  .string()
  .max(2048)
  .refine((value) => frameAncestorsPolicy([value]) !== "frame-ancestors 'self'");
const iceServers = z
  .array(
    z
      .object({
        urls: z
          .array(
            z
              .string()
              .max(2048)
              .regex(/^(stun|stuns|turn|turns):/i),
          )
          .min(1)
          .max(16),
        username: z.string().max(4096).optional(),
        credential: z.string().max(4096).optional(),
      })
      .strict(),
  )
  .max(16);

// Only the local job owner configures a prepared process, before opening its tunnel.
export const sessionConfigurationSchema = z
  .object({
    stream: z
      .object({
        transport: z.literal("webrtc"),
        codec: z.enum(["vp8", "vp9", "h264"]),
        iceServers: iceServers.optional(),
        mjpegFps: z.number().int().min(1).max(MAX_MJPEG_STREAM_FPS),
        mjpegQuality: z.number().min(0.05).max(1),
        maxDimension: z.number().int().min(0).max(4096),
        h264Bitrate: z.number().int().min(100_000).max(50_000_000),
        h264Fps: z.number().int().min(1).max(MAX_VIDEO_STREAM_FPS),
      })
      .strict(),
    corsOrigins: z.array(origin).max(32),
    frameAncestors: z.array(origin).max(32),
    shareUrl: z
      .url()
      .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
      .optional(),
    disableShare: z.boolean(),
    screenshotsDirectory: z
      .string()
      .min(1)
      .max(4096)
      .refine((value) => value.startsWith("/") && !value.includes("\0"))
      .optional(),
    networkCapture: z.boolean(),
    networkCaptureFields: z.array(z.enum(CAPTURE_FIELDS)).max(4),
    networkCaptureProxy: z
      .string()
      .max(8192)
      .refine((value) => {
        try {
          parseCaptureProxy(value);
          return true;
        } catch {
          return false;
        }
      })
      .optional(),
  })
  .strict();

export type SessionConfiguration = z.infer<typeof sessionConfigurationSchema>;

/** Process-bound settings cannot be changed by adopting an already running process. */
export function sessionEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env)
      .filter(
        ([name]) =>
          name !== "SERVE_SIM_STATE_DIR" &&
          name !== "SERVE_SIM_VERSION" &&
          (name === "DEVELOPER_DIR" ||
            name.startsWith("SERVE_SIM_") ||
            name.startsWith("SIMCTL_CHILD_")),
      )
      .sort(([left], [right]) => left.localeCompare(right)) as [string, string][],
  );
}

export function bootSession(): string {
  const value = execFileSync("/usr/sbin/sysctl", ["-n", "kern.bootsessionuuid"], {
    encoding: "utf8",
    timeout: 5000,
  }).trim();
  if (!value) throw new Error("Could not identify the current macOS boot");
  return value;
}
