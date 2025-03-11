import { Bitrate } from "@/components/BitrateSelector";
import { settingsAtom } from "@/utils/atoms/settings";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import native from "@/utils/profiles/native";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiAtom, userAtom } from "./JellyfinProvider";

export type PlaybackType = {
  item?: BaseItemDto | null;
  mediaSource?: MediaSourceInfo | null;
  subtitleIndex?: number | null;
  audioIndex?: number | null;
  bitrate?: Bitrate | null;
};

type PlaySettingsContextType = {
  playSettings: PlaybackType | null;
  mediaSource: MediaSourceInfo | null;
  setPlaySettings: (
    dataOrUpdater:
      | PlaybackType
      | null
      | ((prev: PlaybackType | null) => PlaybackType | null),
  ) => Promise<{ url: string | null; sessionId: string | null } | null>;
  playUrl?: string | null;
  setPlayUrl: React.Dispatch<React.SetStateAction<string | null>>;
  playSessionId?: string | null;
  setOfflineSettings: (data: PlaybackType) => void;
};

const PlaySettingsContext = createContext<PlaySettingsContextType | undefined>(
  undefined,
);

export const PlaySettingsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [playSettings, _setPlaySettings] = useState<PlaybackType | null>(null);
  const [mediaSource, setMediaSource] = useState<MediaSourceInfo | null>(null);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [playSessionId, setPlaySessionId] = useState<string | null>(null);

  const api = useAtomValue(apiAtom);
  const settings = useAtomValue(settingsAtom);
  const user = useAtomValue(userAtom);

  const setOfflineSettings = useCallback((data: PlaybackType) => {
    _setPlaySettings(data);
  }, []);

  const setPlaySettings = useCallback(
    async (
      dataOrUpdater:
        | PlaybackType
        | null
        | ((prev: PlaybackType | null) => PlaybackType | null),
    ): Promise<{ url: string | null; sessionId: string | null } | null> => {
      if (!api || !user || !settings) {
        _setPlaySettings(null);
        return null;
      }

      const newSettings =
        typeof dataOrUpdater === "function"
          ? dataOrUpdater(playSettings)
          : dataOrUpdater;

      if (newSettings === null) {
        _setPlaySettings(null);
        return null;
      }

      try {
        const data = await getStreamUrl({
          api,
          deviceProfile: native,
          item: newSettings?.item,
          mediaSourceId: newSettings?.mediaSource?.Id,
          startTimeTicks: 0,
          maxStreamingBitrate: newSettings?.bitrate?.value,
          audioStreamIndex: newSettings?.audioIndex ?? 0,
          subtitleStreamIndex: newSettings?.subtitleIndex ?? -1,
          userId: user.Id,
        });

        console.log("getStreamUrl ~");
        console.log(`${data?.url?.slice(0, 100)}...${data?.url?.slice(-50)}`);

        _setPlaySettings(newSettings);
        setPlayUrl(data?.url!);
        setPlaySessionId(data?.sessionId!);
        setMediaSource(data?.mediaSource!);

        return data;
      } catch (error) {
        console.warn("Error getting stream URL:", error);
        return null;
      }
    },
    [api, user, settings, playSettings],
  );

  // useEffect(() => {
  //   const postCaps = async () => {
  //     if (!api) return;
  //     await getSessionApi(api).postFullCapabilities({
  //       clientCapabilitiesDto: {
  //         AppStoreUrl: "https://apps.apple.com/us/app/streamyfin/id6593660679",
  //         DeviceProfile: native as any,
  //         IconUrl:
  //           "https://raw.githubusercontent.com/retardgerman/streamyfinweb/refs/heads/main/public/assets/images/icon_new_withoutBackground.png",
  //         PlayableMediaTypes: ["Audio", "Video"],
  //         SupportedCommands: ["Play"],
  //         SupportsMediaControl: true,
  //         SupportsPersistentIdentifier: true,
  //       },
  //     });
  //   };

  //   postCaps();
  // }, [settings, api]);

  return (
    <PlaySettingsContext.Provider
      value={{
        playSettings,
        setPlaySettings,
        playUrl,
        setPlayUrl,
        setOfflineSettings,
        playSessionId,
        mediaSource,
      }}
    >
      {children}
    </PlaySettingsContext.Provider>
  );
};

export const usePlaySettings = () => {
  const context = useContext(PlaySettingsContext);
  if (context === undefined) {
    throw new Error(
      "usePlaySettings must be used within a PlaySettingsProvider",
    );
  }
  return context;
};
