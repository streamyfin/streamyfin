import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useNavigation } from "expo-router";
import { useAtom } from "jotai";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Platform, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Bitrate } from "@/components/BitrateSelector";
import { HeaderButtonGroup } from "@/components/common/HeaderButton";
import { ItemImage } from "@/components/common/ItemImage";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { DownloadSingleItem } from "@/components/DownloadItem";
import { ItemCollections } from "@/components/ItemCollections";
import { ItemCredits } from "@/components/item/ItemCredits";
import { ItemPeopleSections } from "@/components/item/ItemPeopleSections";
import { MediaSourceButton } from "@/components/MediaSourceButton";
import { OverviewText } from "@/components/OverviewText";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { PlayButton } from "@/components/PlayButton";
import { PlayedStatus } from "@/components/PlayedStatus";
import { SimilarItems } from "@/components/SimilarItems";
import { CurrentSeries } from "@/components/series/CurrentSeries";
import { SeasonEpisodesCarousel } from "@/components/series/SeasonEpisodesCarousel";
import { LOGO_HEIGHT } from "@/constants/Images";
import useDefaultPlaySettings from "@/hooks/useDefaultPlaySettings";
import { useImageColorsReturn } from "@/hooks/useImageColorsReturn";
import { useOrientation } from "@/hooks/useOrientation";
import { useVersionItemState } from "@/hooks/useVersionItem";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { toImagePixels } from "@/utils/jellyfin/image/imagePixels";
import {
  canPlayInRemoteSession,
  isPlayableItem,
} from "@/utils/jellyfin/media/isPlayableItem";
import { getPlayingRunTimeTicks } from "@/utils/jellyfin/mediaSourceVersion";
import { AddToFavorites } from "./AddToFavorites";
import { AddToWatchlist } from "./AddToWatchlist";
import { ItemHeader } from "./ItemHeader";
import { ItemTechnicalDetails } from "./ItemTechnicalDetails";
import { PlayInRemoteSessionButton } from "./PlayInRemoteSession";

const Chromecast = !Platform.isTV ? require("./Chromecast") : null;
const ItemContentTV = Platform.isTV
  ? require("./ItemContent.tv").ItemContentTV
  : null;

// Header heights, in layout points.
const HEADER_HEIGHT = 350;
const MOVIE_HEADER_HEIGHT = 500;
const LANDSCAPE_HEADER_HEIGHT = 230;

export type SelectedOptions = {
  bitrate: Bitrate;
  mediaSource: MediaSourceInfo | undefined;
  audioIndex: number | undefined;
  subtitleIndex: number;
};

interface ItemContentProps {
  item?: BaseItemDto | null;
  itemWithSources?: BaseItemDto | null;
  isLoading?: boolean;
}

// Mobile-specific implementation
const ItemContentMobile: React.FC<ItemContentProps> = ({
  item,
  itemWithSources,
}) => {
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();
  const isOffline = useOfflineMode();
  const { getDownloadedItemById } = useDownload();
  // A download pins the tracks it was pulled with, and only the record knows
  // them: resolving against the server media source hands back an index for a
  // stream the local file may not contain.
  const downloadedTracks =
    isOffline && item?.Id
      ? getDownloadedItemById(item.Id)?.userData
      : undefined;
  const { settings } = useSettings();
  const { orientation } = useOrientation();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [user] = useAtom(userAtom);

  const itemColors = useImageColorsReturn({ item });

  const [loadingLogo, setLoadingLogo] = useState(true);
  const [headerHeight, setHeaderHeight] = useState(HEADER_HEIGHT);
  const { width: windowWidth } = useWindowDimensions();

  // The header image is requested for the portrait header in either
  // orientation. The orientation settles a render after mount, so a request
  // sized by the live header would be sent twice, and the portrait header is
  // the taller one: an image that covers it covers the landscape one too.
  const headerImageHeight =
    item?.Type === "Movie" ? MOVIE_HEADER_HEIGHT : HEADER_HEIGHT;

  const [selectedOptions, setSelectedOptions] = useState<
    SelectedOptions | undefined
  >(undefined);

  // On Jellyfin 12 each version keeps its own resume point and played state.
  // A downloaded item keeps the page as it was: Play can open the download,
  // whose position is the item's, not the selected version's.
  const isDownloaded = !!item?.Id && !!getDownloadedItemById(item.Id);
  const { versionItem, isPending: isVersionPending } = useVersionItemState(
    item,
    itemWithSources?.MediaSources,
    isDownloaded ? undefined : selectedOptions?.mediaSource?.Id,
  );
  const playButtonItem = useMemo(
    () =>
      item && versionItem && versionItem !== item
        ? {
            ...item,
            // A version's resume point is against its own runtime.
            RunTimeTicks: getPlayingRunTimeTicks(item, versionItem),
            UserData: versionItem.UserData,
          }
        : item,
    [item, versionItem],
  );

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
      subtitleIndex:
        downloadedTracks?.subtitleStreamIndex ?? defaultSubtitleIndex ?? -1,
      audioIndex: downloadedTracks?.audioStreamIndex ?? defaultAudioIndex,
    }));
  }, [
    defaultAudioIndex,
    defaultBitrate,
    defaultSubtitleIndex,
    defaultMediaSource,
    downloadedTracks,
  ]);

  useEffect(() => {
    if (!Platform.isTV && itemWithSources) {
      navigation.setOptions({
        headerRight: () =>
          item && (
            <HeaderButtonGroup>
              <Chromecast.Chromecast />
              {item.Type !== "Program" && (
                <>
                  {!Platform.isTV && (
                    <DownloadSingleItem item={itemWithSources} size='large' />
                  )}
                  {/* Sends the item's id to another session as a Play
                      command. The server expands a container into its
                      items on the way, so only an unplayable leaf (a Book,
                      a Photo) has nothing to offer the other session. */}
                  {canPlayInRemoteSession(item) &&
                    user?.Policy?.IsAdministrator &&
                    !settings.hideRemoteSessionButton && (
                      <PlayInRemoteSessionButton item={item} size='large' />
                    )}

                  {/* Until the selected version's own state is in, the
                      toggle would mark the primary version instead. */}
                  <PlayedStatus
                    items={[versionItem ?? item]}
                    size='large'
                    pointerEvents={isVersionPending ? "none" : "auto"}
                  />
                  <AddToFavorites item={item} />
                  {settings.streamyStatsServerUrl &&
                    !settings.hideWatchlistsTab && (
                      <AddToWatchlist item={item} />
                    )}
                </>
              )}
            </HeaderButtonGroup>
          ),
      });
    }
  }, [
    item,
    versionItem,
    isVersionPending,
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
        setHeaderHeight(LANDSCAPE_HEADER_HEIGHT);
      else if (item.Type === "Movie") setHeaderHeight(MOVIE_HEADER_HEIGHT);
      else setHeaderHeight(HEADER_HEIGHT);
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
              width={toImagePixels(windowWidth)}
              height={toImagePixels(headerImageHeight)}
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
                height: LOGO_HEIGHT,
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

            {/* A Book, a Season or a folder can land on this page (home
                rows, the libraries tab, a deep link) but has no stream:
                say so rather than offer a Play button that cannot work. */}
            {isPlayableItem(item) ? (
              <View className='flex flex-row px-0 mb-2 justify-between space-x-2'>
                <PlayButton
                  selectedOptions={selectedOptions}
                  item={playButtonItem ?? item}
                  colors={itemColors}
                  // The resume point shown is still the primary version's.
                  disabled={isVersionPending}
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
            ) : (
              <Text className='mb-2 text-neutral-400'>
                {t("player.unsupported_item_type")}
              </Text>
            )}
          </View>
          {item.Type === "Episode" && (
            <SeasonEpisodesCarousel item={item} loading={loading} />
          )}

          {!isOffline &&
            selectedOptions.mediaSource?.MediaStreams &&
            selectedOptions.mediaSource.MediaStreams.length > 0 && (
              <ItemTechnicalDetails source={selectedOptions.mediaSource} />
            )}

          <OverviewText text={item.Overview} className='px-4 mb-4' />

          <ItemCredits people={item.People} className='px-4 mb-4' />

          {item.Type !== "Program" && (
            <>
              {item.Type === "Episode" && !isOffline && (
                <CurrentSeries item={item} className='mb-2' />
              )}

              <ItemPeopleSections item={item} />

              {!isOffline && <ItemCollections itemId={item.Id} />}

              {!isOffline && <SimilarItems item={item} />}
            </>
          )}
        </View>
      </ParallaxScrollView>
    </View>
  );
};

// Memoize the mobile component
const MemoizedItemContentMobile = React.memo(ItemContentMobile);

// Exported component that renders TV or mobile version based on platform
export const ItemContent: React.FC<ItemContentProps> = (props) => {
  if (Platform.isTV && ItemContentTV) {
    return <ItemContentTV {...props} />;
  }
  return <MemoizedItemContentMobile {...props} />;
};
