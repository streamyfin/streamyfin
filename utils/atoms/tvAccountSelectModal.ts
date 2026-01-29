import { atom } from "jotai";
import type {
  SavedServer,
  SavedServerAccount,
} from "@/utils/secureCredentials";

export type TVAccountSelectModalState = {
  server: SavedServer;
  onAccountSelect: (account: SavedServerAccount) => void;
  onAddAccount: () => void;
  onDeleteAccount: (account: SavedServerAccount) => void;
} | null;

export const tvAccountSelectModalAtom = atom<TVAccountSelectModalState>(null);
