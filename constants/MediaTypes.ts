/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
const MediaTypes = {
  Audio: "Audio",
  Video: "Video",
  Photo: "Photo",
  Book: "Book",
} as const;

export type MediaType = (typeof MediaTypes)[keyof typeof MediaTypes];

export default MediaTypes;
