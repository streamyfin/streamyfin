import { atom } from "jotai";
import { makeApi } from "@/test-utils/jellyfinApi";

/**
 * The atoms `@/providers/JellyfinProvider` exposes, without its sign in and
 * server discovery. `apiAtom` holds a `makeApi()` double, so a scenario can
 * answer requests with `api.mock`.
 */
export const jellyfinProviderModule = {
  apiAtom: atom(makeApi()),
  userAtom: atom({ Id: "user-1" }),
  pendingAccountSaveAtom: atom(false),
};
