import { useCallback, useState } from "react";
import { MUSIC_FOLDER_INCLUDE_SUBFOLDERS_KEY } from "@/constants/Music";
import { storage } from "@/utils/mmkv";

/**
 * Whether a music folder's Play all and Shuffle reach into its subfolders,
 * remembered across folders and launches. On until turned off: a folder that
 * only holds folders has nothing to play without them.
 */
export const useIncludeSubfolders = () => {
  const [value, setValue] = useState(
    () => storage.getBoolean(MUSIC_FOLDER_INCLUDE_SUBFOLDERS_KEY) ?? true,
  );

  const onChange = useCallback((next: boolean) => {
    storage.set(MUSIC_FOLDER_INCLUDE_SUBFOLDERS_KEY, next);
    setValue(next);
  }, []);

  return { value, onChange };
};
