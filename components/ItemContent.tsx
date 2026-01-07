import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useNavigation } from "expo-router";
import { useAtom } from "jotai";
import React, { useEffect, useMemo, useState } from "react";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Bitrate } from "@/components/BitrateSelector";
import { ItemImage } from "@/components/common/ItemImage";
import { DownloadSingleItem } from "@/components/DownloadItem";
import { ItemPeopleSections } from "@/components/item/ItemPeopleSections";
import { MediaSourceButton } from "@/components/MediaSourceButton";
import { OverviewText } from "@/components/OverviewText";
import { ParallaxScrollView } from "@/components/ParallaxPage";
// const PlayButton = !Platform.isTV ? require("@/components/PlayButton") : null;
import { PlayButton } from "@/components/PlayButton";
import { PlayedStatus } from "@/components/PlayedStatus";
import { SimilarItems } from "@/components/SimilarItems";
import { CurrentSeries } from "@/components/series/CurrentSeries";
import { SeasonEpisodesCarousel } from "@/components/series/SeasonEpisodesCarousel";
import useDefaultPlaySettings from "@/hooks/useDefaultPlaySettings";
import { useImageColorsReturn } from "@/hooks/useImageColorsReturn";
import { useOrientation } from "@/hooks/useOrientation";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { AddToFavorites } from "./AddToFavorites";
import { AddToWatchlist } from "./AddToWatchlist";
import { ItemHeader } from "./ItemHeader";
import { ItemTechnicalDetails } from "./ItemTechnicalDetails";
import { PlayInRemoteSessionButton } from "./PlayInRemoteSession";

const Chromecast = !Platform.isTV ? require("./Chromecast") : null;

export type SelectedOptions = {
  bitrate: Bitrate;
  mediaSource: MediaSourceInfo | undefined;
  audioIndex: number | undefined;
  subtitleIndex: number;
};

interface ItemContentProps {
  item: BaseItemDto;
  isOffline: boolean;
  itemWithSources?: BaseItemDto | null;
}

export const ItemContent: React.FC<ItemContentProps> = React.memo(
  ({ item, isOffline, itemWithSources }) => {
    const [api] = useAtom(apiAtom);
    const { settings } = useSettings();
    const { orientation } = useOrientation();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const [user] = useAtom(userAtom);

    const itemColors = useImageColorsReturn({ item });

    const [loadingLogo, setLoadingLogo] = useState(true);
    const [headerHeight, setHeaderHeight] = useState(350);

    const [selectedOptions, setSelectedOptions] = useState<
      SelectedOptions | undefined
    >(undefined);

    // Use itemWithSources for play settings since it has MediaSources data
    const {
      defaultAudioIndex,
      defaultBitrate,
      defaultMediaSource,
      defaultSubtitleIndex,
    } = useDefaultPlaySettings(itemWithSources ?? item, settings);

    const logoUrl = useMemo(
      () => (item ? getLogoImageUrlById({ api, item }) : null),
      [api, item],
    );

    const onLogoLoad = React.useCallback(() => {
      setLoadingLogo(false);
    }, []);

    const loading = useMemo(() => {
      return Boolean(logoUrl && loadingLogo);
    }, [loadingLogo, logoUrl]);

    // Needs to automatically change the selected to the default values for default indexes.
    useEffect(() => {
      setSelectedOptions(() => ({
        bitrate: defaultBitrate,
        mediaSource: defaultMediaSource ?? undefined,
        subtitleIndex: defaultSubtitleIndex ?? -1,
        audioIndex: defaultAudioIndex,
      }));
    }, [
      defaultAudioIndex,
      defaultBitrate,
      defaultSubtitleIndex,
      defaultMediaSource,
    ]);

    useEffect(() => {
      if (!Platform.isTV && itemWithSources) {
        navigation.setOptions({
          headerRight: () =>
            item &&
            (Platform.OS === "ios" ? (
              <View className='flex flex-row items-center pl-2'>
                <Chromecast.Chromecast width={22} height={22} />
                {item.Type !== "Program" && (
                  <View className='flex flex-row items-center'>
                    {!Platform.isTV && (
                      <DownloadSingleItem item={itemWithSources} size='large' />
                    )}
                    {user?.Policy?.IsAdministrator &&
                      !settings.hideRemoteSessionButton && (
                        <PlayInRemoteSessionButton item={item} size='large' />
                      )}

                    <PlayedStatus items={[item]} size='large' />
                    <AddToFavorites item={item} />
                    {settings.streamyStatsServerUrl &&
                      !settings.hideWatchlistsTab && (
                        <AddToWatchlist item={item} />
                      )}
                  </View>
                )}
              </View>
            ) : (
              <View className='flex flex-row items-center space-x-2'>
                <Chromecast.Chromecast width={22} height={22} />
                {item.Type !== "Program" && (
                  <View className='flex flex-row items-center space-x-2'>
                    {!Platform.isTV && (
                      <DownloadSingleItem item={itemWithSources} size='large' />
                    )}
                    {user?.Policy?.IsAdministrator &&
                      !settings.hideRemoteSessionButton && (
                        <PlayInRemoteSessionButton item={item} size='large' />
                      )}

                    <PlayedStatus items={[item]} size='large' />
                    <AddToFavorites item={item} />
                    {settings.streamyStatsServerUrl &&
                      !settings.hideWatchlistsTab && (
                        <AddToWatchlist item={item} />
                      )}
                  </View>
                )}
              </View>
            )),
        });
      }
    }, [
      item,
      navigation,
      user,
      itemWithSources,
      settings.hideRemoteSessionButton,
      settings.streamyStatsServerUrl,
      settings.hideWatchlistsTab,
    ]);

    useEffect(() => {
      if (item) {
        if (orientation !== ScreenOrientation.OrientationLock.PORTRAIT_UP)
          setHeaderHeight(230);
        else if (item.Type === "Movie") setHeaderHeight(500);
        else setHeaderHeight(350);
      }
    }, [item, orientation]);

    if (!item || !selectedOptions) return null;

    return (
      <View
        className='flex-1 relative'
        style={{
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <ParallaxScrollView
          className='flex-1'
          headerHeight={headerHeight}
          headerImage={
            <View style={[{ flex: 1 }]}>
              <ItemImage
                variant={
                  item.Type === "Movie" && logoUrl ? "Backdrop" : "Primary"
                }
                item={item}
                style={{
                  width: "100%",
                  height: "100%",
                }}
              />
            </View>
          }
          logo={
            logoUrl ? (
              <Image
                source={{
                  uri: logoUrl,
                }}
                style={{
                  height: 130,
                  width: "100%",
                }}
                contentFit='contain'
                onLoad={onLogoLoad}
                onError={onLogoLoad}
              />
            ) : (
              <View />
            )
          }
        >
          <View className='flex flex-col bg-transparent shrink'>
            <View className='flex flex-col px-4 w-full pt-2 mb-2 shrink'>
              <ItemHeader item={item} className='mb-2' />

              <View className='flex flex-row px-0 mb-2 justify-between space-x-2'>
                <PlayButton
                  selectedOptions={selectedOptions}
                  item={item}
                  isOffline={isOffline}
                  colors={itemColors}
                />
                <View className='w-1' />
                {!isOffline && (
                  <MediaSourceButton
                    selectedOptions={selectedOptions}
                    setSelectedOptions={setSelectedOptions}
                    item={itemWithSources}
                    colors={itemColors}
                  />
                )}
              </View>
            </View>
            {item.Type === "Episode" && (
              <SeasonEpisodesCarousel
                item={item}
                loading={loading}
                isOffline={isOffline}
              />
            )}

            {!isOffline &&
              selectedOptions.mediaSource?.MediaStreams &&
              selectedOptions.mediaSource.MediaStreams.length > 0 && (
                <ItemTechnicalDetails source={selectedOptions.mediaSource} />
              )}

            <OverviewText text={item.Overview} className='px-4 mb-4' />

            {item.Type !== "Program" && (
              <>
                {item.Type === "Episode" && !isOffline && (
                  <CurrentSeries item={item} className='mb-2' />
                )}

                <ItemPeopleSections item={item} isOffline={isOffline} />

                {!isOffline && <SimilarItems itemId={item.Id} />}
              </>
            )}
          </View>
        </ParallaxScrollView>
      </View>
    );
  },
);
