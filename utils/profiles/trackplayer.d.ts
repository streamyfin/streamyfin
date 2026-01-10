/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

export type PlatformType = "ios" | "android";

export interface TrackPlayerProfileOptions {
  /** Target platform */
  platform?: PlatformType;
}

export function generateTrackPlayerProfile(
  options?: TrackPlayerProfileOptions,
): any;

declare const _default: any;
export default _default;
