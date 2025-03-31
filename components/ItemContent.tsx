import { AudioTrackSelector } from "@/components/AudioTrackSelector";
import { type Bitrate, BitrateSelector } from "@/components/BitrateSelector";
import { DownloadSingleItem } from "@/components/DownloadItem";
import { OverviewText } from "@/components/OverviewText";
import { ParallaxScrollView } from "@/components/ParallaxPage";
// const PlayButton = !Platform.isTV ? require("@/components/PlayButton") : null;
import { PlayButton } from "@/components/PlayButton";
import { PlayedStatus } from "@/components/PlayedStatus";
import { SimilarItems } from "@/components/SimilarItems";
import { SubtitleTrackSelector } from "@/components/SubtitleTrackSelector";
import { ItemImage } from "@/components/common/ItemImage";
import { CastAndCrew } from "@/components/series/CastAndCrew";
import { CurrentSeries } from "@/components/series/CurrentSeries";
import { SeasonEpisodesCarousel } from "@/components/series/SeasonEpisodesCarousel";
import useDefaultPlaySettings from "@/hooks/useDefaultPlaySettings";
import { useImageColors } from "@/hooks/useImageColors";
import { useOrientation } from "@/hooks/useOrientation";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
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
import { AddToFavorites } from "./AddToFavorites";
import { ItemHeader } from "./ItemHeader";
import { ItemTechnicalDetails } from "./ItemTechnicalDetails";
import { MediaSourceSelector } from "./MediaSourceSelector";
import { MoreMoviesWithActor } from "./MoreMoviesWithActor";
const Chromecast = !Platform.isTV ? require("./Chromecast") : null;

export type SelectedOptions = {
  bitrate: Bitrate;
  mediaSource: MediaSourceInfo | undefined;
  audioIndex: number | undefined;
  subtitleIndex: number;
};

export const ItemContent: React.FC<{ item: BaseItemDto }> = React.memo(
  ({ item }) => {
    const [api] = useAtom(apiAtom);
    const [settings] = useSettings();
    const { orientation } = useOrientation();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    useImageColors({ item });

    const [loadingLogo, setLoadingLogo] = useState(true);
    const [headerHeight, setHeaderHeight] = useState(350);

    const [selectedOptions, setSelectedOptions] = useState<
      SelectedOptions | undefined
    >(undefined);

    const {
      defaultAudioIndex,
      defaultBitrate,
      defaultMediaSource,
      defaultSubtitleIndex,
    } = useDefaultPlaySettings(item, settings);

    // Needs to automatically change the selected to the default values for default indexes.
    useEffect(() => {
      setSelectedOptions(() => ({
        bitrate: defaultBitrate,
        mediaSource: defaultMediaSource,
        subtitleIndex: defaultSubtitleIndex ?? -1,
        audioIndex: defaultAudioIndex,
      }));
    }, [
      defaultAudioIndex,
      defaultBitrate,
      defaultSubtitleIndex,
      defaultMediaSource,
    ]);

    if (!Platform.isTV) {
      useEffect(() => {
        navigation.setOptions({
          headerRight: () =>
            item && (
              <View className='flex flex-row items-center space-x-2'>
                <Chromecast.Chromecast
                  background='blur'
                  width={22}
                  height={22}
                />
                {item.Type !== "Program" && (
                  <View className='flex flex-row items-center space-x-2'>
                    {!Platform.isTV && (
                      <DownloadSingleItem item={item} size='large' />
                    )}
                    <PlayedStatus items={[item]} size='large' />
                    <AddToFavorites item={item} />
                  </View>
                )}
              </View>
            ),
        });
      }, [item]);
    }

    useEffect(() => {
      if (orientation !== ScreenOrientation.OrientationLock.PORTRAIT_UP)
        setHeaderHeight(230);
      else if (item.Type === "Movie") setHeaderHeight(500);
      else setHeaderHeight(350);
    }, [item.Type, orientation]);

    const logoUrl = useMemo(() => getLogoImageUrlById({ api, item }), [item]);

    const loading = useMemo(() => {
      return Boolean(logoUrl && loadingLogo);
    }, [loadingLogo, logoUrl]);
    if (!selectedOptions) return null;

    return (
      <View
        className='flex-1 relative'
        style={{
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <ParallaxScrollView
          className={`flex-1 ${loading ? "opacity-0" : "opacity-100"}`}
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
                  resizeMode: "contain",
                }}
                onLoad={() => setLoadingLogo(false)}
                onError={() => setLoadingLogo(false)}
              />
            ) : null
          }
        >
          <View className='flex flex-col bg-transparent shrink'>
            <View className='flex flex-col px-4 w-full space-y-2 pt-2 mb-2 shrink'>
              <ItemHeader item={item} className='mb-4' />
              {item.Type !== "Program" && !Platform.isTV && (
                <View className='flex flex-row items-center justify-start w-full h-16'>
                  <BitrateSelector
                    className='mr-1'
                    onChange={(val) =>
                      setSelectedOptions(
                        (prev) => prev && { ...prev, bitrate: val },
                      )
                    }
                    selected={selectedOptions.bitrate}
                  />
                  <MediaSourceSelector
                    className='mr-1'
                    item={item}
                    onChange={(val) =>
                      setSelectedOptions(
                        (prev) =>
                          prev && {
                            ...prev,
                            mediaSource: val,
                          },
                      )
                    }
                    selected={selectedOptions.mediaSource}
                  />
                  <AudioTrackSelector
                    className='mr-1'
                    source={selectedOptions.mediaSource}
                    onChange={(val) => {
                      setSelectedOptions(
                        (prev) =>
                          prev && {
                            ...prev,
                            audioIndex: val,
                          },
                      );
                    }}
                    selected={selectedOptions.audioIndex}
                  />
                  <SubtitleTrackSelector
                    source={selectedOptions.mediaSource}
                    onChange={(val) =>
                      setSelectedOptions(
                        (prev) =>
                          prev && {
                            ...prev,
                            subtitleIndex: val,
                          },
                      )
                    }
                    selected={selectedOptions.subtitleIndex}
                  />
                </View>
              )}

              <PlayButton
                className='grow'
                selectedOptions={selectedOptions}
                item={item}
              />
            </View>

            {item.Type === "Episode" && (
              <SeasonEpisodesCarousel item={item} loading={loading} />
            )}

            <ItemTechnicalDetails source={selectedOptions.mediaSource} />
            <OverviewText text={item.Overview} className='px-4 mb-4' />

            {item.Type !== "Program" && (
              <>
                {item.Type === "Episode" && (
                  <CurrentSeries item={item} className='mb-4' />
                )}

                <CastAndCrew item={item} className='mb-4' loading={loading} />

                {item.People && item.People.length > 0 && (
                  <View className='mb-4'>
                    {item.People.slice(0, 3).map((person, idx) => (
                      <MoreMoviesWithActor
                        currentItem={item}
                        key={idx}
                        actorId={person.Id!}
                        className='mb-4'
                      />
                    ))}
                  </View>
                )}

                <SimilarItems itemId={item.Id} />
              </>
            )}
          </View>
        </ParallaxScrollView>
      </View>
    );
  },
);
