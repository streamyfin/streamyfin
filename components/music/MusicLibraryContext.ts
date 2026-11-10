import { createContext, useContext } from "react";

/**
 * The music library whose top tabs are on screen. The tabs live under the
 * `music/[libraryId]` layout, and since Expo Router 58 a child route no longer
 * receives its parent's params, so the layout hands the id down.
 */
export const MusicLibraryIdContext = createContext<string | undefined>(
  undefined,
);

export const useMusicLibraryId = () => useContext(MusicLibraryIdContext);
