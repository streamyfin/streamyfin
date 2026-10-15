import type { NetInfoState } from "@react-native-community/netinfo";
import { atom } from "jotai";
import type { NextEpisodesNetwork } from "@/utils/atoms/settings";
import { isUnmeteredConnection } from "./downloadRequest";

/**
 * Why the next episodes of a series are not downloading, for the downloads
 * page and the download sheet to say so. Null while nothing holds them back.
 */
export type NextEpisodesHold =
  | "low_space"
  | "waiting_for_wifi"
  | "waiting_for_home_network"
  | null;
export const nextEpisodesHoldAtom = atom<NextEpisodesHold>(null);

/**
 * What the connection setting holds back, if anything. On the home network the
 * app talks to the server's local address, so downloads go over the LAN and
 * never through the remote connection.
 */
export const networkHold = (
  allowed: NextEpisodesNetwork,
  connection: Pick<NetInfoState, "type" | "isConnected" | "details">,
  onHomeNetwork: boolean,
): NextEpisodesHold => {
  if (allowed === "home") {
    return onHomeNetwork ? null : "waiting_for_home_network";
  }
  if (allowed === "wifi" && !isUnmeteredConnection(connection)) {
    return "waiting_for_wifi";
  }
  return null;
};
