import { describe, expect, test } from "bun:test";
import type { SleepTimerType } from "@/utils/atoms/settings";
import { formatDuration, sleepTimerOptionLabel } from "./formatDuration";

// i18next stand-in: "jellysleep.hour" + count 2 -> "hours"
const t = (key: string, o?: { count?: number }) =>
  key.split(".")[1] + (o?.count === 1 ? "" : "s");

describe("formatDuration", () => {
  test("minutes, exact hours, mixed, zero", () => {
    expect(formatDuration(15, t)).toBe("15 minutes");
    expect(formatDuration(1, t)).toBe("1 minute");
    expect(formatDuration(60, t)).toBe("1 hour");
    expect(formatDuration(120, t)).toBe("2 hours");
    expect(formatDuration(90, t)).toBe("1 hour 30 minutes");
    expect(formatDuration(0, t)).toBe("0 minutes");
  });
});

describe("sleepTimerOptionLabel", () => {
  test("derives label from the stored value", () => {
    const duration = "duration" as SleepTimerType;
    const episode = "episode" as SleepTimerType;
    expect(sleepTimerOptionLabel({ type: duration, duration: 30 }, t)).toBe(
      "30 minutes",
    );
    expect(sleepTimerOptionLabel({ type: episode, episodeCount: 1 }, t)).toBe(
      "after_episode",
    );
  });
});
