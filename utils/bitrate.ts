import type { TFunction } from "i18next";
import {
  AUTO_BITRATE_KEY,
  AUTO_BITRATE_VALUE,
  MAX_BITRATE_KEY,
  MAX_BITRATE_VALUE,
  NATIVE_AUTO_QUALITY_INDEX,
  NATIVE_MAX_QUALITY_INDEX,
} from "@/constants/Bitrate";
import { BITRATES, type Bitrate } from "@/constants/Playback";
import { isLiveTvItem } from "@/utils/jellyfin/media/isLiveTvItem";

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
 * The qualities the pickers of this device offer, the default first: Auto,
 * measured on the connection, then the caps.
 */
export const PLAYBACK_BITRATES: Bitrate[] = [AUTO_BITRATE, ...BITRATES];

/**
 * A quality as a play request carries it to the player: a bitrate in bit/s,
 * Auto until the player measures it, or Max, no cap. A request that carries
 * none plays at the default quality.
 */
export type BitrateRequest =
  | number
  | typeof AUTO_BITRATE_VALUE
  | typeof MAX_BITRATE_VALUE;

/**
 * Live TV plays without a cap unless a bitrate was picked by hand, as the
 * guide and the channel grid do: Auto never measures for it, and a request
 * with no quality stands for none, whatever the default. Applied before the
 * default, where the players negotiate the stream.
 */
export const liveTvBitrateRequest = <T extends BitrateRequest | undefined>(
  item: { Type?: string | null } | null | undefined,
  request: T,
): T | typeof MAX_BITRATE_VALUE =>
  isLiveTvItem(item) &&
  (request === undefined || request === AUTO_BITRATE_VALUE)
    ? MAX_BITRATE_VALUE
    : request;

/** Told by its key: Auto has no bitrate of its own, and neither has Max. */
export const isAutoBitrate = (bitrate?: Pick<Bitrate, "key"> | null) =>
  bitrate?.key === AUTO_BITRATE_KEY;

/** A quality without a bitrate that is not Auto sets no cap. */
export const toBitrateRequest = (bitrate: Bitrate): BitrateRequest => {
  if (isAutoBitrate(bitrate)) return AUTO_BITRATE_VALUE;
  return bitrate.value ?? MAX_BITRATE_VALUE;
};

/** The quality as the player's route writes it. */
export const toBitrateParam = (bitrate: Bitrate): string =>
  toBitrateRequest(bitrate).toString();

/** Undefined when the route names no quality. */
export const parseBitrateParam = (
  param?: string | null,
): BitrateRequest | undefined => {
  if (param === AUTO_BITRATE_VALUE || param === MAX_BITRATE_VALUE) {
    return param;
  }
  const bitrate = param ? Number.parseInt(param, 10) : Number.NaN;
  return Number.isFinite(bitrate) ? bitrate : undefined;
};

/**
 * The quality a playback plays at: the one it was started with, or the
 * default from the settings when it was started with none, as a Play command
 * from another client, a Top Shelf tile or a SyncPlay group are.
 */
export const withDefaultBitrate = (
  request: BitrateRequest | undefined,
  defaultBitrate: Bitrate | null | undefined,
): BitrateRequest =>
  request ?? toBitrateRequest(defaultBitrate ?? AUTO_BITRATE);

/**
 * The quality the player's route plays at, as its quality menus mark it:
 * live TV that names none plays at Max, whatever the default.
 */
export const routeBitrateParam = (
  param: string | null | undefined,
  defaultBitrate: Bitrate | null | undefined,
  item?: { Type?: string | null } | null,
): string =>
  withDefaultBitrate(
    liveTvBitrateRequest(item, parseBitrateParam(param)),
    defaultBitrate,
  ).toString();

/**
 * The JS player's quality menu, on the phone and on TV: every quality as the
 * route writes it, the one playing marked, and a route that names none at the
 * default quality.
 */
export const playerQualityOptions = (
  t: TFunction,
  routeParam: string | null | undefined,
  defaultBitrate: Bitrate | null | undefined,
  item?: { Type?: string | null } | null,
) => {
  const playing = routeBitrateParam(routeParam, defaultBitrate, item);
  return PLAYBACK_BITRATES.map((bitrate) => ({
    label: bitrateLabel(t, bitrate),
    value: toBitrateParam(bitrate),
    selected: playing === toBitrateParam(bitrate),
  }));
};

export const toNativeQualityIndex = (request: BitrateRequest): number => {
  if (request === AUTO_BITRATE_VALUE) return NATIVE_AUTO_QUALITY_INDEX;
  return request === MAX_BITRATE_VALUE ? NATIVE_MAX_QUALITY_INDEX : request;
};

export const fromNativeQualityIndex = (index: number): BitrateRequest => {
  if (index === NATIVE_AUTO_QUALITY_INDEX) return AUTO_BITRATE_VALUE;
  return index === NATIVE_MAX_QUALITY_INDEX ? MAX_BITRATE_VALUE : index;
};

/** A download is a file, with no connection to adapt to: Auto is Max there. */
export const toDownloadBitrate = (bitrate: Bitrate): Bitrate =>
  isAutoBitrate(bitrate) ? MAX_BITRATE : bitrate;

/** The other qualities are named by their key, the same in every language. */
export const bitrateLabel = (t: TFunction, bitrate: Bitrate): string =>
  isAutoBitrate(bitrate) ? t("item_card.quality_auto") : bitrate.key;
