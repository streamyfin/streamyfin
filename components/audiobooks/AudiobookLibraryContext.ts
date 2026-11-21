import { createContext, useContext } from "react";

/**
 * The books library whose top tabs are on screen. A child route of the
 * `audiobooks/[libraryId]` layout does not receive the layout's params since
 * Expo Router 58, so the layout hands the id down, as music does.
 */
export const AudiobookLibraryIdContext = createContext<string | undefined>(
  undefined,
);

export const useAudiobookLibraryId = () =>
  useContext(AudiobookLibraryIdContext);
