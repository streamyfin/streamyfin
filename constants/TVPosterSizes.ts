/**
 * @deprecated Import from "@/constants/TVSizes" instead.
 * This file is kept for backwards compatibility.
 */

export {
  type ScaledTVPosterSizes,
  TVPosterSizes,
  useScaledTVPosterSizes,
} from "./TVSizes";

export type TVPosterSizeKey = keyof typeof import("./TVSizes").TVPosterSizes;
