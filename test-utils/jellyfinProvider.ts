import { atom } from "jotai";
import { makeApi } from "@/test-utils/jellyfinApi";

/**
 * `@/utils/atoms/api` without a stored session. `apiAtom` holds a
 * `makeApi()` double, so a scenario can answer requests with `api.mock`.
 */
export const apiAtomsModule = {
  apiAtom: atom(makeApi()),
  userAtom: atom({ Id: "user-1" }),
};

/**
 * The atoms `@/providers/JellyfinProvider` exposes, without its sign in and
 * server discovery. It re-exports the api atoms, as the provider does, so
 * code reading either module gets the same double.
 */
export const jellyfinProviderModule = {
  ...apiAtomsModule,
  pendingAccountSaveAtom: atom(false),
};
