import { REMOTE_QUALITY_KNOWN_TARGETS_MAX } from "@/constants/Cast";
import type { RemoteTarget } from "@/modules/mpv-player/src/cast/Cast.types";
import {
  bitrateRequestFor,
  forgetTarget,
  NO_REMOTE_QUALITY,
  rememberTarget,
  setKindQuality,
  setTargetQuality,
} from "./remoteQuality";

const salon: RemoteTarget = {
  kind: "cast",
  id: "device-a",
  name: "Salon",
  capabilities: { volume: true },
};
const bedroom: RemoteTarget = { ...salon, id: "device-b", name: "Bedroom" };

test("aKnownTargetOverridesItsKind", () => {
  const quality = {
    ...NO_REMOTE_QUALITY,
    byKind: { cast: "8 Mb/s" },
    byTarget: { "device-a": "2 Mb/s" },
  };
  expect(bitrateRequestFor(salon, quality)).toBe(2_000_000);
  expect(bitrateRequestFor(bedroom, quality)).toBe(8_000_000);
});

test("theKindAppliesToAnUnknownTarget", () => {
  expect(
    bitrateRequestFor(salon, {
      ...NO_REMOTE_QUALITY,
      byKind: { cast: "4 Mb/s" },
    }),
  ).toBe(4_000_000);
});

// Auto is the cast's default (rule of 30/10): what the link to the server measures.
test("nothingSetMeansAuto", () => {
  expect(bitrateRequestFor(salon, NO_REMOTE_QUALITY)).toBe("auto");
  expect(bitrateRequestFor(salon, undefined)).toBe("auto");
  expect(
    bitrateRequestFor(salon, {
      ...NO_REMOTE_QUALITY,
      byKind: { cast: "Auto" },
    }),
  ).toBe("auto");
  // A key no longer in the list falls back to the default.
  expect(
    bitrateRequestFor(salon, {
      ...NO_REMOTE_QUALITY,
      byKind: { cast: "3 Mb/s" },
    }),
  ).toBe("auto");
});

// Max stays an explicit choice: the receiver then plays at its own ceiling (RECEIVER_UNCAPPED_BITRATE).
test("maxMeansNoCap", () => {
  expect(
    bitrateRequestFor(salon, { ...NO_REMOTE_QUALITY, byKind: { cast: "Max" } }),
  ).toBe("max");
  expect(
    bitrateRequestFor(salon, {
      ...NO_REMOTE_QUALITY,
      byKind: { cast: "4 Mb/s" },
      byTarget: { "device-a": "Max" },
    }),
  ).toBe("max");
});

test("aConnectionRemembersTheTarget", () => {
  const once = rememberTarget(NO_REMOTE_QUALITY, salon);
  expect(once.known).toEqual([{ id: "device-a", name: "Salon", kind: "cast" }]);
  // The latest first, under the name it has now.
  const renamed = rememberTarget(rememberTarget(once, bedroom), {
    ...salon,
    name: "Living room",
  });
  expect(renamed.known.map((known) => known.name)).toEqual([
    "Living room",
    "Bedroom",
  ]);
});

test("theKnownTargetsStayCapped", () => {
  let quality = NO_REMOTE_QUALITY;
  for (let index = 0; index <= REMOTE_QUALITY_KNOWN_TARGETS_MAX; index++) {
    quality = rememberTarget(quality, {
      ...salon,
      id: `device-${index}`,
      name: `Receiver ${index}`,
    });
    if (index === 0) quality = setTargetQuality(quality, "device-0", "1 Mb/s");
  }
  expect(quality.known).toHaveLength(REMOTE_QUALITY_KNOWN_TARGETS_MAX);
  // The oldest leaves the list, its quality with it.
  expect(quality.known.some((known) => known.id === "device-0")).toBe(false);
  expect(quality.byTarget["device-0"]).toBeUndefined();
});

test("a target's own quality can go back to its kind's", () => {
  const set = setTargetQuality(
    rememberTarget(NO_REMOTE_QUALITY, salon),
    "device-a",
    "2 Mb/s",
  );
  expect(set.byTarget).toEqual({ "device-a": "2 Mb/s" });
  expect(setTargetQuality(set, "device-a", undefined).byTarget).toEqual({});
});

test("a forgotten target leaves the list with its quality", () => {
  const quality = setTargetQuality(
    rememberTarget(rememberTarget(NO_REMOTE_QUALITY, salon), bedroom),
    "device-a",
    "2 Mb/s",
  );
  const forgotten = forgetTarget(quality, "device-a");
  expect(forgotten.known.map((known) => known.id)).toEqual(["device-b"]);
  expect(forgotten.byTarget).toEqual({});
});

test("the kind's quality is set by key", () => {
  expect(setKindQuality(NO_REMOTE_QUALITY, "cast", "4 Mb/s").byKind).toEqual({
    cast: "4 Mb/s",
  });
});
