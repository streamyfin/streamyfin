import { atom } from "jotai";
import type { SavedServerAccount } from "@/utils/secureCredentials";

export type TVUserSwitchModalState = {
  serverUrl: string;
  serverName: string;
  accounts: SavedServerAccount[];
  currentUserId: string;
  onAccountSelect: (account: SavedServerAccount) => void;
} | null;

export const tvUserSwitchModalAtom = atom<TVUserSwitchModalState>(null);
