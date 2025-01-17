import { Ionicons } from "@expo/vector-icons";
import {
  MediaSourceInfo,
  type MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import React, { useMemo, useRef } from "react";
import { TouchableOpacity, View } from "react-native";
import { Badge } from "./Badge";
import { Text } from "./common/Text";
import {
  BottomSheetModal,
  BottomSheetBackdropProps,
  BottomSheetBackdrop,
  BottomSheetView,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { Button } from "./Button";
import { useTranslation } from "react-i18next";

interface Props {
  source?: MediaSourceInfo;
}

export const ItemTechnicalDetails: React.FC<Props> = ({ source, ...props }) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { t } = useTranslation();

  return (
    <View className="px-4 mt-2 mb-4">
      <Text className="text-lg font-bold mb-4">{t("item_card.video")}</Text>
      <TouchableOpacity onPress={() => bottomSheetModalRef.current?.present()}>
        <View className="flex flex-row space-x-2">
          <VideoStreamInfo source={source} />
        </View>
        <Text className="text-purple-600">{t("item_card.more_details")}</Text>
      </TouchableOpacity>
      <BottomSheetModal
        ref={bottomSheetModalRef}
        snapPoints={["80%"]}
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
        backdropComponent={(props: BottomSheetBackdropProps) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
      >
        <BottomSheetScrollView>
          <View className="flex flex-col space-y-2 p-4 mb-4">
            <View className="">
              <Text className="text-lg font-bold mb-4">{t("item_card.video")}</Text>
              <View className="flex flex-row space-x-2">
                <VideoStreamInfo source={source} />
              </View>
            </View>

            <View className="">
              <Text className="text-lg font-bold mb-2">{t("item_card.audio")}</Text>
              <AudioStreamInfo
                audioStreams={
                  source?.MediaStreams?.filter(
                    (stream) => stream.Type === "Audio"
                  ) || []
                }
              />
            </View>

            <View className="">
              <Text className="text-lg font-bold mb-2">{t("item_card.subtitles")}</Text>
              <SubtitleStreamInfo
                subtitleStreams={
                  source?.MediaStreams?.filter(
                    (stream) => stream.Type === "Subtitle"
                  ) || []
                }
              />
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  );
};

const SubtitleStreamInfo = ({
  subtitleStreams,
}: {
  subtitleStreams: MediaStream[];
}) => {
  return (
    <View className="flex flex-col">
      {subtitleStreams.map((stream, index) => (
        <View key={stream.Index} className="flex flex-col">
          <Text className="text-xs mb-3 text-neutral-400">
            {stream.DisplayTitle}
          </Text>
          <View className="flex flex-row flex-wrap gap-2">
            <Badge
              variant="gray"
              iconLeft={
                <Ionicons name="language-outline" size={16} color="white" />
              }
              text={stream.Language}
            />
            <Badge
              variant="gray"
              text={stream.Codec}
              iconLeft={
                <Ionicons name="layers-outline" size={16} color="white" />
              }
            />
          </View>
        </View>
      ))}
    </View>
  );
};

const AudioStreamInfo = ({ audioStreams }: { audioStreams: MediaStream[] }) => {
  return (
    <View className="flex flex-col">
      {audioStreams.map((audioStreams, index) => (
        <View key={index} className="flex flex-col">
          <Text className="mb-3 text-neutral-400 text-xs">
            {audioStreams.DisplayTitle}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Badge
              variant="gray"
              iconLeft={
                <Ionicons name="language-outline" size={16} color="white" />
              }
              text={audioStreams.Language}
            />
            <Badge
              variant="gray"
              iconLeft={
                <Ionicons
                  name="musical-notes-outline"
                  size={16}
                  color="white"
                />
              }
              text={audioStreams.Codec}
            />
            <Badge
              variant="gray"
              iconLeft={<Ionicons name="mic-outline" size={16} color="white" />}
              text={audioStreams.ChannelLayout}
            />
            <Badge
              variant="gray"
              iconLeft={
                <Ionicons name="speedometer-outline" size={16} color="white" />
              }
              text={formatBitrate(audioStreams.BitRate)}
            />
          </View>
        </View>
      ))}
    </View>
  );
};

const VideoStreamInfo = ({ source }: { source?: MediaSourceInfo }) => {
  if (!source) return null;

  const videoStream = useMemo(() => {
    return source.MediaStreams?.find(
      (stream) => stream.Type === "Video"
    ) as MediaStream;
  }, [source.MediaStreams]);

  if (!videoStream) return null;

  return (
    <View className="flex-row flex-wrap gap-2">
      <Badge
        variant="gray"
        iconLeft={<Ionicons name="film-outline" size={16} color="white" />}
        text={formatFileSize(source.Size)}
      />
      <Badge
        variant="gray"
        iconLeft={<Ionicons name="film-outline" size={16} color="white" />}
        text={`${videoStream.Width}x${videoStream.Height}`}
      />
      <Badge
        variant="gray"
        iconLeft={
          <Ionicons name="color-palette-outline" size={16} color="white" />
        }
        text={videoStream.VideoRange}
      />
      <Badge
        variant="gray"
        iconLeft={
          <Ionicons name="code-working-outline" size={16} color="white" />
        }
        text={videoStream.Codec}
      />
      <Badge
        variant="gray"
        iconLeft={
          <Ionicons name="speedometer-outline" size={16} color="white" />
        }
        text={formatBitrate(videoStream.BitRate)}
      />
      <Badge
        variant="gray"
        iconLeft={<Ionicons name="play-outline" size={16} color="white" />}
        text={`${videoStream.AverageFrameRate?.toFixed(0)} fps`}
      />
    </View>
  );
};

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return "N/A";

  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 Byte";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString());
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
};

const formatBitrate = (bitrate?: number | null) => {
  if (!bitrate) return "N/A";

  const sizes = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"];
  if (bitrate === 0) return "0 bps";
  const i = parseInt(Math.floor(Math.log(bitrate) / Math.log(1000)).toString());
  return Math.round((bitrate / Math.pow(1000, i)) * 100) / 100 + " " + sizes[i];
};
