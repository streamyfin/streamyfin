import { AudioTrackSelector } from "@/components/AudioTrackSelector";
import { Bitrate, BitrateSelector } from "@/components/BitrateSelector";
import { DownloadItem } from "@/components/DownloadItem";
import { OverviewText } from "@/components/OverviewText";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { PlayButton } from "@/components/PlayButton";
import { PlayedStatus } from "@/components/PlayedStatus";
import { SimilarItems } from "@/components/SimilarItems";
import { SubtitleTrackSelector } from "@/components/SubtitleTrackSelector";
import { ItemImage } from "@/components/common/ItemImage";
import { CastAndCrew } from "@/components/series/CastAndCrew";
import { CurrentSeries } from "@/components/series/CurrentSeries";
import { SeasonEpisodesCarousel } from "@/components/series/SeasonEpisodesCarousel";
import { useImageColors } from "@/hooks/useImageColors";
import { apiAtom } from "@/providers/JellyfinProvider";
import { usePlaySettings } from "@/providers/PlaySettingsProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import { useFocusEffect, useNavigation } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chromecast } from "./Chromecast";
import { ItemHeader } from "./ItemHeader";
import { MediaSourceSelector } from "./MediaSourceSelector";
import { MoreMoviesWithActor } from "./MoreMoviesWithActor";

export const ItemContent: React.FC<{ item: BaseItemDto }> = React.memo(
  ({ item }) => {
    const [api] = useAtom(apiAtom);
    const { setPlaySettings, playUrl, playSettings } = usePlaySettings();
    const [settings] = useSettings();
    const navigation = useNavigation();

    const [loadingLogo, setLoadingLogo] = useState(true);

    const [orientation, setOrientation] = useState(
      ScreenOrientation.Orientation.PORTRAIT_UP
    );

    useFocusEffect(
      useCallback(() => {
        if (!settings) return;
        const { bitrate, mediaSource, audioIndex, subtitleIndex } =
          getDefaultPlaySettings(item, settings);

        setPlaySettings({
          item,
          bitrate,
          mediaSource,
          audioIndex,
          subtitleIndex,
        });

        if (!mediaSource) {
          Alert.alert("Error", "No media source found for this item.");
          navigation.goBack();
        }
      }, [item, settings])
    );

    const selectedMediaSource = useMemo(() => {
      return playSettings?.mediaSource || undefined;
    }, [playSettings?.mediaSource]);

    const setSelectedMediaSource = (mediaSource: MediaSourceInfo) => {
      setPlaySettings((prev) => ({
        ...prev,
        mediaSource,
      }));
    };

    const selectedAudioStream = useMemo(() => {
      return playSettings?.audioIndex;
    }, [playSettings?.audioIndex]);

    const setSelectedAudioStream = (audioIndex: number) => {
      setPlaySettings((prev) => ({
        ...prev,
        audioIndex,
      }));
    };

    const selectedSubtitleStream = useMemo(() => {
      return playSettings?.subtitleIndex;
    }, [playSettings?.subtitleIndex]);

    const setSelectedSubtitleStream = (subtitleIndex: number) => {
      setPlaySettings((prev) => ({
        ...prev,
        subtitleIndex,
      }));
    };

    const maxBitrate = useMemo(() => {
      return playSettings?.bitrate;
    }, [playSettings?.bitrate]);

    const setMaxBitrate = (bitrate: Bitrate | undefined) => {
      setPlaySettings((prev) => ({
        ...prev,
        bitrate,
      }));
    };

    useEffect(() => {
      const subscription = ScreenOrientation.addOrientationChangeListener(
        (event) => {
          setOrientation(event.orientationInfo.orientation);
        }
      );

      ScreenOrientation.getOrientationAsync().then((initialOrientation) => {
        setOrientation(initialOrientation);
      });

      return () => {
        ScreenOrientation.removeOrientationChangeListener(subscription);
      };
    }, []);

    const [headerHeight, setHeaderHeight] = useState(350);

    useImageColors({ item });

    useEffect(() => {
      navigation.setOptions({
        headerRight: () =>
          item && (
            <View className="flex flex-row items-center space-x-2">
              <Chromecast background="blur" width={22} height={22} />
              {item.Type !== "Program" && (
                <View className="flex flex-row items-center space-x-2">
                  <DownloadItem item={item} />
                  <PlayedStatus item={item} />
                </View>
              )}
            </View>
          ),
      });
    }, [item]);

    useEffect(() => {
      // If landscape
      if (orientation !== ScreenOrientation.Orientation.PORTRAIT_UP) {
        setHeaderHeight(230);
        return;
      }

      if (item.Type === "Movie") setHeaderHeight(500);
      else setHeaderHeight(350);
    }, [item.Type, orientation]);

    const logoUrl = useMemo(() => getLogoImageUrlById({ api, item }), [item]);

    const loading = useMemo(() => {
      return Boolean(logoUrl && loadingLogo);
    }, [loadingLogo, logoUrl]);

    const insets = useSafeAreaInsets();

    return (
      <View
        className="flex-1 relative"
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
            <>
              {logoUrl ? (
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
              ) : null}
            </>
          }
        >
          <View className="flex flex-col bg-transparent shrink">
            <View className="flex flex-col px-4 w-full space-y-2 pt-2 mb-2 shrink">
              <ItemHeader item={item} className="mb-4" />
              {item.Type !== "Program" && (
                <View className="flex flex-row items-center justify-start w-full h-16">
                  <BitrateSelector
                    className="mr-1"
                    onChange={(val) => setMaxBitrate(val)}
                    selected={maxBitrate}
                  />
                  <MediaSourceSelector
                    className="mr-1"
                    item={item}
                    onChange={setSelectedMediaSource}
                    selected={selectedMediaSource}
                  />
                  {selectedMediaSource && (
                    <>
                      <AudioTrackSelector
                        className="mr-1"
                        source={selectedMediaSource}
                        onChange={setSelectedAudioStream}
                        selected={selectedAudioStream}
                      />
                      <SubtitleTrackSelector
                        source={selectedMediaSource}
                        onChange={setSelectedSubtitleStream}
                        selected={selectedSubtitleStream}
                      />
                    </>
                  )}
                </View>
              )}

              <PlayButton className="grow" />
            </View>

            {item.Type === "Episode" && (
              <SeasonEpisodesCarousel item={item} loading={loading} />
            )}

            <OverviewText text={item.Overview} className="px-4 my-4" />
            {item.Type !== "Program" && (
              <>
                <CastAndCrew item={item} className="mb-4" loading={loading} />

                {item.People && item.People.length > 0 && (
                  <View className="mb-4">
                    {item.People.slice(0, 3).map((person) => (
                      <MoreMoviesWithActor
                        currentItem={item}
                        key={person.Id}
                        actorId={person.Id!}
                        className="mb-4"
                      />
                    ))}
                  </View>
                )}

                {item.Type === "Episode" && (
                  <CurrentSeries item={item} className="mb-4" />
                )}

                <SimilarItems itemId={item.Id} />
              </>
            )}

            <View className="h-16"></View>
          </View>
        </ParallaxScrollView>
      </View>
    );
  }
);
