import { atom } from "jotai";
import type { SavedServer } from "@/utils/secureCredentials";

export type TVServerActionModalState = {
  server: SavedServer;
  onLogin: () => void;
  onDelete: () => void;
} | null;

export const tvServerActionModalAtom = atom<TVServerActionModalState>(null);
