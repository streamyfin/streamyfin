import type { Settings } from "../atoms/settings";
import { buildSubtitleStyle } from "./subtitleStyle";

const baseSettings = {
  subtitleSize: 1,
  subtitleBackground: false,
  subtitleBackgroundOpacity: 60,
  subtitleBackgroundPadding: 8,
  subtitleFont: "System",
  subtitleColor: "#FFFFFF",
  subtitleMarginY: 25,
  subtitleAlignX: "center",
  subtitleAlignY: "bottom",
} as Settings;

describe("buildSubtitleStyle", () => {
  it("builds the unified subtitle appearance", () => {
    expect(
      buildSubtitleStyle({
        ...baseSettings,
        subtitleSize: 1.2,
        subtitleBackground: true,
        subtitleBackgroundOpacity: 50,
        subtitleBackgroundPadding: 12,
        subtitleColor: "#FF00FF",
      }),
    ).toEqual({
      scale: 1.2,
      scaleLocked: undefined,
      marginY: 25,
      alignX: "center",
      alignY: "bottom",
      color: "#FF00FF",
      font: "System",
      background: "#80000000",
      backgroundPadding: 12,
      assOverride: "force",
    });
  });

  it("accepts render-time scale, margin and lock overrides", () => {
    const style = buildSubtitleStyle(baseSettings, {
      scale: 0.75,
      marginY: 50,
      scaleLocked: true,
    });
    expect(style.scale).toBe(0.75);
    expect(style.marginY).toBe(50);
    expect(style.scaleLocked).toBe(true);
    expect(style.assOverride).toBe("no");
  });

  it("uses defaults when optional style values are missing", () => {
    expect(
      buildSubtitleStyle({
        ...baseSettings,
        subtitleMarginY: undefined,
      } as unknown as Settings).assOverride,
    ).toBe("no");
  });
});
