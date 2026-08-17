import type {
  CultureDto,
  UserDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useAtomValue } from "jotai";
import { createContext, type ReactNode, useContext } from "react";
import { useMediaPreferences } from "@/hooks/useMediaPreferences";
import { apiAtom } from "@/providers/JellyfinProvider";
import type { Settings } from "@/utils/atoms/settings";

interface MediaContextType {
  settings: Settings | null;
  updateSettings: (update: Partial<Settings>) => void;
  user: UserDto | undefined;
  cultures: CultureDto[];
  supportsOriginalAudioLanguage: boolean;
  isReady: boolean;
}

const MediaContext = createContext<MediaContextType | undefined>(undefined);

export const useMedia = () => {
  const context = useContext(MediaContext);
  if (!context) {
    throw new Error("useMedia must be used within a MediaProvider");
  }
  return context;
};

/**
 * Context wrapper over {@link useMediaPreferences} for the mobile settings
 * screens. The sync itself lives in the hook so the TV settings screen — which
 * has no provider — shares one implementation instead of a second copy.
 */
export const MediaProvider = ({ children }: { children: ReactNode }) => {
  const api = useAtomValue(apiAtom);
  const {
    settings,
    updateMediaSettings,
    user,
    cultures,
    supportsOriginalAudioLanguage,
    isReady,
  } = useMediaPreferences();

  if (!api) return null;

  return (
    <MediaContext.Provider
      value={{
        settings,
        updateSettings: updateMediaSettings,
        user,
        cultures,
        supportsOriginalAudioLanguage,
        isReady,
      }}
    >
      {children}
    </MediaContext.Provider>
  );
};
