import type { TFunction } from "i18next";
import type { Bitrate } from "@/components/BitrateSelector";
import {
  AUTO_BITRATE_KEY,
  AUTO_BITRATE_VALUE,
  MAX_BITRATE_KEY,
  NATIVE_AUTO_QUALITY_INDEX,
  NATIVE_MAX_QUALITY_INDEX,
} from "@/constants/Bitrate";

export const formatBitrate = (bitrate?: number | null) => {
  if (!bitrate) return "N/A";

  const sizes = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
  if (bitrate === 0) return "0 bps";
  const i = Number.parseInt(
    Math.floor(Math.log(bitrate) / Math.log(1000)).toString(),
    10,
  );
  return `${Math.round((bitrate / 1000 ** i) * 100) / 100} ${sizes[i]}`;
};

export const AUTO_BITRATE: Bitrate = {
  key: AUTO_BITRATE_KEY,
  value: undefined,
};
export const MAX_BITRATE: Bitrate = { key: MAX_BITRATE_KEY, value: undefined };

/**
 * A quality as a play request carries it to the player: a bitrate in bit/s,
 * or Auto until the player measures it. Max carries nothing, it has no cap.
 */
export type BitrateRequest = number | typeof AUTO_BITRATE_VALUE;

/** Told by its key: Auto has no bitrate of its own, and neither has Max. */
export const isAutoBitrate = (bitrate?: Pick<Bitrate, "key"> | null) =>
  bitrate?.key === AUTO_BITRATE_KEY;

export const toBitrateRequest = (
  bitrate?: Bitrate | null,
): BitrateRequest | undefined =>
  isAutoBitrate(bitrate) ? AUTO_BITRATE_VALUE : bitrate?.value;

/** The quality as the player's route writes it, "" for Max. */
export const toBitrateParam = (bitrate?: Bitrate | null): string =>
  toBitrateRequest(bitrate)?.toString() ?? "";

export const parseBitrateParam = (
  param?: string | null,
): BitrateRequest | undefined => {
  if (param === AUTO_BITRATE_VALUE) return AUTO_BITRATE_VALUE;
  const bitrate = param ? Number.parseInt(param, 10) : Number.NaN;
  return Number.isFinite(bitrate) ? bitrate : undefined;
};

export const toNativeQualityIndex = (request?: BitrateRequest): number =>
  request === AUTO_BITRATE_VALUE
    ? NATIVE_AUTO_QUALITY_INDEX
    : (request ?? NATIVE_MAX_QUALITY_INDEX);

export const fromNativeQualityIndex = (
  index: number,
): BitrateRequest | undefined => {
  if (index === NATIVE_AUTO_QUALITY_INDEX) return AUTO_BITRATE_VALUE;
  return index === NATIVE_MAX_QUALITY_INDEX ? undefined : index;
};

/** A download is a file, with no connection to adapt to: Auto is Max there. */
export const toDownloadBitrate = (bitrate: Bitrate): Bitrate =>
  isAutoBitrate(bitrate) ? MAX_BITRATE : bitrate;

/** The other qualities are named by their key, the same in every language. */
export const bitrateLabel = (t: TFunction, bitrate: Bitrate): string =>
  isAutoBitrate(bitrate) ? t("item_card.quality_auto") : bitrate.key;
