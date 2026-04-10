import { atom } from "jotai";
import type {
  SavedServer,
  SavedServerAccount,
} from "@/utils/secureCredentials";

export type TVAccountActionModalState = {
  server: SavedServer;
  account: SavedServerAccount;
  onLogin: () => void;
  onDelete: () => void;
} | null;

export const tvAccountActionModalAtom = atom<TVAccountActionModalState>(null);
