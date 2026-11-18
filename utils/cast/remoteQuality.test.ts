import {
  CHROMECAST_STICK_AUTO_MAX_BITRATE,
  CHROMECAST_STICK_MODEL,
} from "@/constants/Cast";
import { autoBitrateOn } from "./remoteQuality";

// A Chromecast stick freezes before the heavy segments of a film the server copies, a link it measures fast or not.
describe("Auto on a receiver model", () => {
  test("a Chromecast stick stays at its ceiling above it", () => {
    expect(autoBitrateOn(56_687_567, CHROMECAST_STICK_MODEL)).toBe(
      CHROMECAST_STICK_AUTO_MAX_BITRATE,
    );
  });

  test("a Chromecast stick keeps a slower measure", () => {
    expect(autoBitrateOn(3_000_000, CHROMECAST_STICK_MODEL)).toBe(3_000_000);
  });

  // Nothing measured means no cap, which on this model is the ceiling.
  test("a Chromecast stick that measured nothing gets its ceiling", () => {
    expect(autoBitrateOn(undefined, CHROMECAST_STICK_MODEL)).toBe(
      CHROMECAST_STICK_AUTO_MAX_BITRATE,
    );
  });

  test("another model gets the measure", () => {
    expect(autoBitrateOn(56_687_567, "Google TV Streamer")).toBe(56_687_567);
    expect(autoBitrateOn(undefined, "Google TV Streamer")).toBeUndefined();
  });

  test("an unknown model gets the measure", () => {
    expect(autoBitrateOn(56_687_567, null)).toBe(56_687_567);
    expect(autoBitrateOn(56_687_567, undefined)).toBe(56_687_567);
  });
});
