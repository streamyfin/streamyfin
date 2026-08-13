import { describe, expect, it } from "bun:test";
import type { Settings } from "../atoms/settings";
import {
  applySubtitleStyle,
  buildSubtitleStyle,
  type SubtitleStyleTarget,
} from "./subtitleStyle";

describe("buildSubtitleStyle", () => {
  const baseSettings = {
    mpvSubtitleScale: 1.2,
    mpvSubtitleMarginY: 20,
    mpvSubtitleAlignX: "center",
    mpvSubtitleAlignY: "bottom",
  } as Settings;

  it("calculates background alpha hex accurately at default opacity 75", () => {
    const style = buildSubtitleStyle({
      ...baseSettings,
      mpvSubtitleBackgroundEnabled: true,
      mpvSubtitleBackgroundOpacity: undefined,
    });
    expect(style.borderStyle).toBe("background-box");
    expect(style.backgroundColor).toBe("#000000BF");
    expect(style.assOverride).toBe("force");
  });

  it("calculates background alpha hex accurately at 0%, 50%, 100% opacity", () => {
    const style0 = buildSubtitleStyle({
      ...baseSettings,
      mpvSubtitleBackgroundEnabled: true,
      mpvSubtitleBackgroundOpacity: 0,
    });
    expect(style0.backgroundColor).toBe("#00000000");

    const style50 = buildSubtitleStyle({
      ...baseSettings,
      mpvSubtitleBackgroundEnabled: true,
      mpvSubtitleBackgroundOpacity: 50,
    });
    expect(style50.backgroundColor).toBe("#00000080");

    const style100 = buildSubtitleStyle({
      ...baseSettings,
      mpvSubtitleBackgroundEnabled: true,
      mpvSubtitleBackgroundOpacity: 100,
    });
    expect(style100.backgroundColor).toBe("#000000FF");
  });

  it("enforces 3-property invariant when background is disabled", () => {
    const style = buildSubtitleStyle({
      ...baseSettings,
      mpvSubtitleBackgroundEnabled: false,
    });
    expect(style.borderStyle).toBe("outline-and-shadow");
    expect(style.backgroundColor).toBe("#00000000");
    expect(style.assOverride).toBe("no");
  });

  it("passes positional properties through", () => {
    const style = buildSubtitleStyle(baseSettings);
    expect(style.scale).toBe(1.2);
    expect(style.marginY).toBe(20);
    expect(style.alignX).toBe("center");
    expect(style.alignY).toBe("bottom");
  });
});

describe("applySubtitleStyle", () => {
  it("calls player setters in expected order", async () => {
    const calls: string[] = [];
    const mockPlayer: SubtitleStyleTarget = {
      setSubtitleScale: async (val) => {
        calls.push(`scale:${val}`);
      },
      setSubtitleMarginY: async (val) => {
        calls.push(`marginY:${val}`);
      },
      setSubtitleAlignX: async (val) => {
        calls.push(`alignX:${val}`);
      },
      setSubtitleAlignY: async (val) => {
        calls.push(`alignY:${val}`);
      },
      setSubtitleBorderStyle: async (val) => {
        calls.push(`borderStyle:${val}`);
      },
      setSubtitleBackgroundColor: async (val) => {
        calls.push(`backgroundColor:${val}`);
      },
      setSubtitleAssOverride: async (val) => {
        calls.push(`assOverride:${val}`);
      },
    };

    const style = buildSubtitleStyle({
      mpvSubtitleScale: 1.0,
      mpvSubtitleMarginY: 10,
      mpvSubtitleAlignX: "center",
      mpvSubtitleAlignY: "bottom",
      mpvSubtitleBackgroundEnabled: true,
      mpvSubtitleBackgroundOpacity: 100,
    } as Settings);

    await applySubtitleStyle(mockPlayer, style);

    expect(calls).toEqual([
      "scale:1",
      "marginY:10",
      "alignX:center",
      "alignY:bottom",
      "borderStyle:background-box",
      "backgroundColor:#000000FF",
      "assOverride:force",
    ]);
  });

  it("handles null or undefined player gracefully", async () => {
    await expect(applySubtitleStyle(null, {})).resolves.toBeUndefined();
    await expect(applySubtitleStyle(undefined, {})).resolves.toBeUndefined();
  });
});
