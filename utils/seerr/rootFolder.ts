import "@/augmentations/number";
import type { RootFolder } from "./types";

export const rootFolderLabel = (folder: RootFolder): string =>
  typeof folder.freeSpace === "number"
    ? `${folder.path} (${folder.freeSpace.bytesToReadable()})`
    : folder.path;
