/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export type PlatformType = "ios" | "android";
export type PlayerType = "vlc" | "ksplayer";
export type AudioTranscodeModeType = "auto" | "stereo" | "5.1" | "passthrough";

export interface ProfileOptions {
  /** Target platform */
  platform?: PlatformType;
  /** Video player being used */
  player?: PlayerType;
  /** Audio transcoding mode */
  audioMode?: AudioTranscodeModeType;
}

export function generateDeviceProfile(options?: ProfileOptions): any;
