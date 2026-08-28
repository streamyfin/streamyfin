/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

/**
 * Subset of the MpvPlayer native module used for capability probing.
 * `supportsAv1HardwareDecode` is implemented on iOS/tvOS only.
 */
type MpvPlayerCapabilities = {
  supportsAv1HardwareDecode?: () => boolean;
};

/**
 * Result of the native probe. Only set once the native module has actually
 * answered — a fallback answer is never cached, so an early call made before
 * the module is reachable (e.g. the import-time profile in `./download`) cannot
 * poison the value for the rest of the process.
 */
let cachedAv1Support: boolean | undefined;

/**
 * Fallback when the native check cannot be reached — most likely a JS-only OTA
 * update running against an older binary. Mirrors the split the check would
 * produce today: no Apple TV has an AV1 decoder, every AV1-capable iPhone does.
 * Keeps phones on their existing direct-play behaviour rather than regressing
 * them into needless transcodes.
 */
const assumedAv1Support = (): boolean => !Platform.isTV;

const probeAv1HardwareDecode = (): boolean | undefined => {
  // Android plays AV1 through mpv's own decoder stack (dav1d via FFmpeg) with
  // vo=gpu, which handles 10-bit planar output natively and has never shown the
  // Apple-platform stall. Leave Android behaviour exactly as it was.
  if (Platform.OS !== "ios") return true;

  const mpv = requireOptionalNativeModule<MpvPlayerCapabilities>("MpvPlayer");
  if (typeof mpv?.supportsAv1HardwareDecode !== "function") return undefined;

  try {
    return mpv.supportsAv1HardwareDecode();
  } catch {
    return undefined;
  }
};

/**
 * Whether this device can decode AV1 in hardware.
 *
 * Apple silicon only gained AV1 decode with A17 Pro / M3, so no Apple TV
 * shipped to date can do it (Apple TV 4K 3rd gen is A15) while recent iPhones
 * can. When VideoToolbox refuses the codec, mpv falls back to software decode
 * and the tvOS `vo_avfoundation` path stalls, so the player hangs instead of
 * playing — hence gating what the device profile advertises to Jellyfin.
 *
 * Backed by `VTIsHardwareDecodeSupported` rather than a hardcoded
 * `Platform.isTV`, so a future AV1-capable Apple TV regains direct play with no
 * code change.
 */
export const supportsAv1HardwareDecode = (): boolean => {
  if (cachedAv1Support === undefined) {
    cachedAv1Support = probeAv1HardwareDecode();
  }
  return cachedAv1Support ?? assumedAv1Support();
};

/**
 * Subset of the ExoPlayer native module used for capability probing.
 * `supportsDolbyVisionDecode` is implemented on Android only.
 */
type ExoPlayerCapabilities = {
  supportsDolbyVisionDecode?: () => boolean;
};

let cachedDolbyVisionSupport: boolean | undefined;

/**
 * Whether this Android device ships a decoder whose `video/dolby-vision`
 * CodecCapabilities accept a Profile 5 (dvh1) MediaFormat — a MIME-only
 * advertisement is not sufficient, as decoders may declare the type purely
 * for Profiles 7/8 enhancement/base-layer handling. On DV-certified Android
 * TV hardware the SoC's HEVC decoder is DV-aware: handed a single-layer DV
 * stream (Profile 5/8) with its codec identity intact, it renders real Dolby
 * Vision and the vendor pipeline signals DV over HDMI. Devices without a
 * Profile 5-capable decoder would render pure Profile 5 purple/green, so the
 * device profile keeps transcoding those (see `./native`).
 */
export const supportsDolbyVisionHardwareDecode = (): boolean => {
  if (Platform.OS !== "android" || !Platform.isTV) return false;

  if (cachedDolbyVisionSupport === undefined) {
    const exo = requireOptionalNativeModule<ExoPlayerCapabilities>("ExoPlayer");
    try {
      // Fallback false = current behavior (transcode pure Profile 5), so an
      // unreachable probe (JS-only OTA update on an older binary) can never
      // regress an uncertified device into broken colors.
      cachedDolbyVisionSupport = exo?.supportsDolbyVisionDecode?.() ?? false;
    } catch {
      cachedDolbyVisionSupport = false;
    }
  }
  return cachedDolbyVisionSupport;
};
