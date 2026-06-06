import { atom } from "jotai";
import type { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type { MediaRequestBody } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";

export type TVRequestModalState = {
  requestBody: MediaRequestBody;
  title: string;
  id: number;
  mediaType: MediaType;
  onRequested: () => void;
} | null;

export const tvRequestModalAtom = atom<TVRequestModalState>(null);
