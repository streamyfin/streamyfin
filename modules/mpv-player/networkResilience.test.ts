import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Regression test for the mpv reconnect fix (see NETWORK_RESILIENCE.md).
// The fix lives in native Swift/Kotlin with no JS bridge surface, so this
// asserts by reading the source that both renderers still carry the
// verified option set, applied before mpv initializes.

const IOS_RENDERER = join(__dirname, "ios/MPVLayerRenderer.swift");
const ANDROID_RENDERER = join(
  __dirname,
  "android/src/main/java/expo/modules/mpvplayer/MPVLayerRenderer.kt",
);

/** Pulls the string value passed for a `"key", "value"` mpv option-setter call. */
const extractOptionValue = (src: string, key: string): string | undefined => {
  const re = new RegExp(`"${key}"[\\s\\S]{0,60}?"([^"]+)"`);
  return src.match(re)?.[1];
};

const parseStreamLavfO = (value: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const pair of value.split(",")) {
    const [k, v] = pair.split("=");
    if (k) out[k.trim()] = (v ?? "").trim();
  }
  return out;
};

describe.each([
  {
    platform: "iOS",
    path: IOS_RENDERER,
    initMarker: "mpv_initialize(handle)",
  },
  {
    platform: "Android",
    path: ANDROID_RENDERER,
    initMarker: "mpv.initialize()",
  },
])(
  "mpv network resilience — $platform renderer",
  ({
    path,
    initMarker,
  }: {
    platform: string;
    path: string;
    initMarker: string;
  }) => {
    const src = readFileSync(path, "utf8");

    test("sets a bounded network-timeout", () => {
      const raw = extractOptionValue(src, "network-timeout");
      expect(raw).toBeDefined();
      const seconds = Number(raw);
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(30);
    });

    test("enables reconnect on the ffmpeg http/https protocol", () => {
      const raw = extractOptionValue(src, "stream-lavf-o");
      expect(raw).toBeDefined();
      const opts = parseStreamLavfO(raw as string);

      expect(opts.reconnect).toBe("1");
      expect(opts.reconnect_streamed).toBe("1");
      expect(opts.reconnect_delay_max).toBeDefined();
      expect(Number(opts.reconnect_delay_max)).toBeGreaterThan(0);
      expect(Number(opts.reconnect_delay_max)).toBeLessThanOrEqual(30);

      // See NETWORK_RESILIENCE.md: verified harmful, must stay unset.
      expect(opts.reconnect_at_eof).not.toBe("1");
    });

    test("the reconnect options are applied at mpv start-up, not per-load", () => {
      const timeoutIdx = src.indexOf('"network-timeout"');
      const lavfIdx = src.indexOf('"stream-lavf-o"');
      const initIdx = src.indexOf(initMarker);

      expect(timeoutIdx).toBeGreaterThan(-1);
      expect(lavfIdx).toBeGreaterThan(-1);
      expect(initIdx).toBeGreaterThan(-1);
      expect(timeoutIdx).toBeLessThan(initIdx);
      expect(lavfIdx).toBeLessThan(initIdx);
    });
  },
);
