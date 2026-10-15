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
  | "home_network_not_set_up"
  | null;
export const nextEpisodesHoldAtom = atom<NextEpisodesHold>(null);

/**
 * What the connection setting holds back, if anything. On the home network the
 * app talks to the server's local address, so downloads go over the LAN and
 * never through the remote connection.
 *
 * Home network only without a home network set up on the device (a server
 * admin can set it, or the setup can be removed after) never falls back to
 * another network: the remote connection is what it rules out. It says what is
 * missing instead, since waiting would not end on its own.
 */
export const networkHold = (
  allowed: NextEpisodesNetwork,
  connection: Pick<NetInfoState, "type" | "isConnected" | "details">,
  homeNetwork: { setUp: boolean; on: boolean },
): NextEpisodesHold => {
  if (allowed === "home") {
    if (!homeNetwork.setUp) return "home_network_not_set_up";
    return homeNetwork.on ? null : "waiting_for_home_network";
  }
  if (allowed === "wifi" && !isUnmeteredConnection(connection)) {
    return "waiting_for_wifi";
  }
  return null;
};
