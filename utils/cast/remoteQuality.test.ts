import { REMOTE_QUALITY_KNOWN_TARGETS_MAX } from "@/constants/Cast";
import type { RemoteTarget } from "@/modules/mpv-player/src/cast/Cast.types";
import {
  forgetTarget,
  maxBitrateFor,
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
  expect(maxBitrateFor(salon, quality)).toBe(2_000_000);
  expect(maxBitrateFor(bedroom, quality)).toBe(8_000_000);
});

test("theKindAppliesToAnUnknownTarget", () => {
  expect(
    maxBitrateFor(salon, { ...NO_REMOTE_QUALITY, byKind: { cast: "4 Mb/s" } }),
  ).toBe(4_000_000);
});

// The receiver then plays at its own uncapped ceiling (RECEIVER_UNCAPPED_BITRATE).
test("nothingSetMeansNoCap", () => {
  expect(maxBitrateFor(salon, NO_REMOTE_QUALITY)).toBeUndefined();
  expect(maxBitrateFor(salon, undefined)).toBeUndefined();
  expect(
    maxBitrateFor(salon, { ...NO_REMOTE_QUALITY, byKind: { cast: "Max" } }),
  ).toBeUndefined();
  // A key no longer in the list caps nothing.
  expect(
    maxBitrateFor(salon, { ...NO_REMOTE_QUALITY, byKind: { cast: "3 Mb/s" } }),
  ).toBeUndefined();
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
