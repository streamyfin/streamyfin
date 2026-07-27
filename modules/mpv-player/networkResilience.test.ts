import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Regression test for the "playback stops after a while, only seeking or
// restarting helps" bug (see NETWORK_RESILIENCE.md in this directory for
// the full root-cause writeup and the empirical proof this fix works).
//
// mpv has no native HTTP client — every remote source (DirectPlay,
// DirectStream, and each HLS transcode segment) is read through FFmpeg's
// http/https protocol, whose reconnect behavior defaults to OFF. Without
// `network-timeout` + `stream-lavf-o` reconnect options set at mpv
// start-up, a connection that dies mid-stream (proxy idle-timeout,
// cellular handover, brief server hiccup) makes playback freeze forever
// with no error and no recovery.
//
// This can't be exercised as a normal JS unit test (the fix lives in
// native Swift/Kotlin, and there's no RN/JS bridge surface for it — it's
// unconditional, not user-configurable). Instead this test asserts, by
// reading the actual source, that both native renderers carry the exact
// option set that was empirically verified (via a standalone libavformat
// harness — see NETWORK_RESILIENCE.md) to fix the freeze without
// introducing a regression at normal end-of-stream. It exists so the fix
// can't silently regress (e.g. an unrelated refactor of `start()` dropping
// the block, or someone "cleaning up" what looks like a redundant option).

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
      // Must be a real, finite timeout: 0 means "protocol default" (often no
      // timeout at all on some protocols), and it must not be unreasonably
      // long — the whole point is to detect a dead connection promptly.
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(30);
    });

    test("enables reconnect on the ffmpeg http/https protocol", () => {
      const raw = extractOptionValue(src, "stream-lavf-o");
      expect(raw).toBeDefined();
      const opts = parseStreamLavfO(raw as string);

      // The actual fix: reopen the connection (resuming via Range) instead
      // of surfacing a fatal error when the socket dies mid-stream.
      expect(opts.reconnect).toBe("1");
      // Jellyfin streams (DirectStream, and each HLS segment individually)
      // aren't always advertised as trivially seekable up front — this
      // covers reconnecting on streamed/non-seekable responses too.
      expect(opts.reconnect_streamed).toBe("1");
      // Reconnect delay must be capped, not left to retry forever.
      expect(opts.reconnect_delay_max).toBeDefined();
      expect(Number(opts.reconnect_delay_max)).toBeGreaterThan(0);
      expect(Number(opts.reconnect_delay_max)).toBeLessThanOrEqual(30);

      // Empirically verified to be actively harmful for Jellyfin's use case:
      // every stream here has a known, bounded length (a single
      // Content-Length file, or one bounded request per HLS segment), never
      // an open-ended growing resource. Enabling reconnect_at_eof made a
      // real avio_read() loop retry for several seconds past a correct,
      // complete end-of-stream before giving up — see NETWORK_RESILIENCE.md
      // for the reproduction. It must stay unset (or explicitly "0").
      expect(opts.reconnect_at_eof).not.toBe("1");
    });

    test("the reconnect options are applied at mpv start-up, not per-load", () => {
      // Must be configured before mpv_initialize/mpv.initialize() so they
      // apply unconditionally to every load() call (direct play, direct
      // stream, transcode, and every subsequent episode/track switch that
      // reuses the same mpv instance) — not bolted on to one specific
      // playback path.
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
