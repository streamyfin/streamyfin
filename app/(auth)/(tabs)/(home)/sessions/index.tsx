import { Badge } from "@/components/Badge";
import { Loader } from "@/components/Loader";
import { Text } from "@/components/common/Text";
import Poster from "@/components/posters/Poster";
import { useInterval } from "@/hooks/useInterval";
import { useSessions, type useSessionsProps } from "@/hooks/useSessions";
import { apiAtom } from "@/providers/JellyfinProvider";
import { formatBitrate } from "@/utils/bitrate";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { formatTimeString } from "@/utils/time";
import {
  AntDesign,
  Entypo,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import {
  HardwareAccelerationType,
  type SessionInfoDto,
} from "@jellyfin/sdk/lib/generated-client";
import {
  GeneralCommandType,
  PlaystateCommand,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { get } from "lodash";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";

export default function page() {
  const { sessions, isLoading } = useSessions({} as useSessionsProps);
  const { t } = useTranslation();

  if (isLoading)
    return (
      <View className='justify-center items-center h-full'>
        <Loader />
      </View>
    );

  if (!sessions || sessions.length === 0)
    return (
      <View className='h-full w-full flex justify-center items-center'>
        <Text className='text-lg text-neutral-500'>
          {t("home.sessions.no_active_sessions")}
        </Text>
      </View>
    );

  return (
    <FlashList
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingTop: 17,
        paddingHorizontal: 17,
        paddingBottom: 150,
      }}
      data={sessions}
      renderItem={({ item }) => <SessionCard session={item} />}
      keyExtractor={(item) => item.Id || ""}
      estimatedItemSize={200}
    />
  );
}

interface SessionCardProps {
  session: SessionInfoDto;
}

const SessionCard = ({ session }: SessionCardProps) => {
  const api = useAtomValue(apiAtom);
  const [remainingTicks, setRemainingTicks] = useState<number>(0);

  const tick = () => {
    if (session.PlayState?.IsPaused) return;
    setRemainingTicks(remainingTicks - 10000000);
  };

  const getProgressPercentage = () => {
    if (!session.NowPlayingItem || !session.NowPlayingItem.RunTimeTicks) {
      return 0;
    }

    return Math.round(
      (100 / session.NowPlayingItem?.RunTimeTicks) *
        (session.NowPlayingItem?.RunTimeTicks - remainingTicks),
    );
  };

  useEffect(() => {
    const currentTime = session.PlayState?.PositionTicks;
    const duration = session.NowPlayingItem?.RunTimeTicks;
    if (
      duration !== null &&
      duration !== undefined &&
      currentTime !== null &&
      currentTime !== undefined
    ) {
      const remainingTimeTicks = duration - currentTime;
      setRemainingTicks(remainingTimeTicks);
    }
  }, [session]);

  const { data: ipInfo } = useQuery({
    queryKey: ["ipinfo", session.RemoteEndPoint],
    cacheTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      const resp = await api.axiosInstance.get(
        `https://freeipapi.com/api/json/${session.RemoteEndPoint}`,
      );
      return resp.data;
    },
  });

  // Handle session controls
  const [isControlLoading, setIsControlLoading] = useState<
    Record<string, boolean>
  >({});

  const handleSystemCommand = async (command: GeneralCommandType) => {
    if (!api || !session.Id) return false;

    setIsControlLoading({ ...isControlLoading, [command]: true });

    try {
      getSessionApi(api).sendSystemCommand({
        sessionId: session.Id,
        command,
      });
      return true;
    } catch (error) {
      console.error(`Error sending ${command} command:`, error);
      return false;
    } finally {
      setIsControlLoading({ ...isControlLoading, [command]: false });
    }
  };

  const handlePlaystateCommand = async (command: PlaystateCommand) => {
    if (!api || !session.Id) return false;

    setIsControlLoading({ ...isControlLoading, [command]: true });

    try {
      getSessionApi(api).sendPlaystateCommand({
        sessionId: session.Id,
        command,
      });

      return true;
    } catch (error) {
      console.error(`Error sending playstate ${command} command:`, error);
      return false;
    } finally {
      setIsControlLoading({ ...isControlLoading, [command]: false });
    }
  };

  const handlePlayPause = async () => {
    console.log("handlePlayPause");
    await handlePlaystateCommand(PlaystateCommand.PlayPause);
  };

  const handleStop = async () => {
    await handlePlaystateCommand(PlaystateCommand.Stop);
  };

  const handlePrevious = async () => {
    await handlePlaystateCommand(PlaystateCommand.PreviousTrack);
  };

  const handleNext = async () => {
    await handlePlaystateCommand(PlaystateCommand.NextTrack);
  };

  const handleToggleMute = async () => {
    await handleSystemCommand(GeneralCommandType.ToggleMute);
  };
  const handleVolumeUp = async () => {
    await handleSystemCommand(GeneralCommandType.VolumeUp);
  };
  const handleVolumeDown = async () => {
    await handleSystemCommand(GeneralCommandType.VolumeDown);
  };

  useInterval(tick, 1000);

  return (
    <View className='flex flex-col shadow-md bg-neutral-900 rounded-2xl mb-4'>
      <View className='flex flex-row p-4'>
        <View className='w-20 pr-4'>
          <Poster
            id={session.NowPlayingItem?.Id}
            url={getPrimaryImageUrl({ api, item: session.NowPlayingItem })}
          />
        </View>
        <View className='w-full flex-1'>
          <View className='flex flex-row justify-between'>
            <View className='flex-1 pr-4'>
              {session.NowPlayingItem?.Type === "Episode" ? (
                <>
                  <Text className='font-bold'>
                    {session.NowPlayingItem?.Name}
                  </Text>
                  <Text numberOfLines={1} className='text-xs opacity-50'>
                    {`S${session.NowPlayingItem.ParentIndexNumber?.toString()}:E${session.NowPlayingItem.IndexNumber?.toString()}`}
                    {" - "}
                    {session.NowPlayingItem.SeriesName}
                  </Text>
                </>
              ) : (
                <>
                  <Text className='font-bold'>
                    {session.NowPlayingItem?.Name}
                  </Text>
                  <Text className='text-xs opacity-50'>
                    {session.NowPlayingItem?.ProductionYear}
                  </Text>
                  <Text className='text-xs opacity-50'>
                    {session.NowPlayingItem?.SeriesName}
                  </Text>
                </>
              )}
            </View>
            <Text className='text-xs opacity-50 align-right text-right'>
              {session.UserName}
              {"\n"}
              {session.Client}
              {"\n"}
              {session.DeviceName}
              {"\n"}
              {ipInfo?.cityName} {ipInfo?.countryCode}
            </Text>
          </View>
          <View className='flex-1' />
          <View className='flex flex-col align-bottom'>
            <View className='flex flex-row justify-between align-bottom mb-1'>
              <Text className='-ml-0.5 text-xs opacity-50 align-left text-left'>
                {!session.PlayState?.IsPaused ? (
                  <Ionicons name='play' size={14} color='white' />
                ) : (
                  <Ionicons name='pause' size={14} color='white' />
                )}
              </Text>
              <Text className='text-xs opacity-50 align-right text-right'>
                {formatTimeString(remainingTicks, "tick")} left
              </Text>
            </View>
            <View className='align-bottom bg-gray-800 h-1'>
              <View
                className={"bg-purple-600 h-full"}
                style={{
                  width: `${getProgressPercentage()}%`,
                }}
              />
            </View>

            {/* Session controls */}
            <View className='flex flex-row mt-2 space-x-4 justify-center'>
              <TouchableOpacity
                onPress={handlePrevious}
                disabled={isControlLoading[PlaystateCommand.PreviousTrack]}
                style={{
                  opacity: isControlLoading[PlaystateCommand.PreviousTrack]
                    ? 0.5
                    : 1,
                }}
              >
                <MaterialCommunityIcons
                  name='skip-previous'
                  size={24}
                  color='white'
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePlayPause}
                disabled={isControlLoading[PlaystateCommand.PlayPause]}
                style={{
                  opacity: isControlLoading[PlaystateCommand.PlayPause]
                    ? 0.5
                    : 1,
                }}
              >
                {session.PlayState?.IsPaused ? (
                  <Ionicons name='play' size={24} color='white' />
                ) : (
                  <Ionicons name='pause' size={24} color='white' />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleStop}
                disabled={isControlLoading[PlaystateCommand.Stop]}
                style={{
                  opacity: isControlLoading[PlaystateCommand.Stop] ? 0.5 : 1,
                }}
              >
                <Ionicons name='stop' size={24} color='white' />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleNext}
                disabled={isControlLoading[PlaystateCommand.NextTrack]}
                style={{
                  opacity: isControlLoading[PlaystateCommand.NextTrack]
                    ? 0.5
                    : 1,
                }}
              >
                <MaterialCommunityIcons
                  name='skip-next'
                  size={24}
                  color='white'
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleVolumeDown}
                disabled={isControlLoading[GeneralCommandType.VolumeDown]}
                style={{
                  opacity: isControlLoading[GeneralCommandType.VolumeDown]
                    ? 0.5
                    : 1,
                }}
              >
                <Ionicons name='volume-low' size={24} color='white' />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleToggleMute}
                disabled={isControlLoading[GeneralCommandType.ToggleMute]}
                style={{
                  opacity: isControlLoading[GeneralCommandType.ToggleMute]
                    ? 0.5
                    : 1,
                }}
              >
                <Ionicons
                  name='volume-mute'
                  size={24}
                  color={session.PlayState?.IsMuted ? "red" : "white"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleVolumeUp}
                disabled={isControlLoading[GeneralCommandType.VolumeUp]}
                style={{
                  opacity: isControlLoading[GeneralCommandType.VolumeUp]
                    ? 0.5
                    : 1,
                }}
              >
                <Ionicons name='volume-high' size={24} color='white' />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      <TranscodingView session={session} />
    </View>
  );
};

interface TranscodingBadgesProps {
  properties: StreamProps;
}

const TranscodingBadges = ({ properties }: TranscodingBadgesProps) => {
  const iconMap = {
    bitrate: <Ionicons name='speedometer-outline' size={12} color='white' />,
    codec: <Ionicons name='layers-outline' size={12} color='white' />,
    videoRange: (
      <Ionicons name='color-palette-outline' size={12} color='white' />
    ),
    resolution: <Ionicons name='film-outline' size={12} color='white' />,
    language: <Ionicons name='language-outline' size={12} color='white' />,
    audioChannels: <Ionicons name='mic-outline' size={12} color='white' />,
    hwType: <Ionicons name='hardware-chip-outline' size={12} color='white' />,
  } as const;

  const icon = (val: string) => {
    return (
      iconMap[val as keyof typeof iconMap] ?? (
        <Ionicons name='layers-outline' size={12} color='white' />
      )
    );
  };

  const formatVal = (key: string, val: any) => {
    switch (key) {
      case "bitrate":
        return formatBitrate(val);
      case "hwType":
        return val === HardwareAccelerationType.None ? "sw" : "hw";
      default:
        return val;
    }
  };

  return Object.entries(properties)
    .filter(([_, value]) => value !== undefined && value !== null)
    .map(([key]) => (
      <Badge
        key={key}
        variant='gray'
        className='m-0 p-0 pt-0.5 mr-1'
        text={formatVal(key, properties[key as keyof StreamProps])}
        iconLeft={icon(key)}
      />
    ));
};

interface StreamProps {
  hwType?: HardwareAccelerationType | null | undefined;
  resolution?: string | null | undefined;
  language?: string | null | undefined;
  codec?: string | null | undefined;
  bitrate?: number | null | undefined;
  videoRange?: string | null | undefined;
  audioChannels?: string | null | undefined;
}

interface TranscodingStreamViewProps {
  title: string | undefined;
  value?: string;
  isTranscoding: boolean;
  transcodeValue?: string | undefined | null;
  properties: StreamProps;
  transcodeProperties?: StreamProps;
}

const TranscodingStreamView = ({
  title,
  isTranscoding,
  properties,
  transcodeProperties,
  value,
  transcodeValue,
}: TranscodingStreamViewProps) => {
  return (
    <View className='flex flex-col pt-2 first:pt-0'>
      <View className='flex flex-row'>
        <Text className='text-xs opacity-50 w-20 font-bold text-right pr-4'>
          {title}
        </Text>
        <Text className='flex-1'>
          <TranscodingBadges properties={properties} />
        </Text>
      </View>
      {isTranscoding && transcodeProperties ? (
        <>
          <View className='flex flex-row'>
            <Text className='-mt-0 text-xs opacity-50 w-20 font-bold text-right pr-4'>
              <MaterialCommunityIcons
                name='arrow-right-bottom'
                size={14}
                color='white'
              />
            </Text>
            <Text className='flex-1 text-sm mt-1'>
              <TranscodingBadges properties={transcodeProperties} />
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
};

const TranscodingView = ({ session }: SessionCardProps) => {
  const videoStream = useMemo(() => {
    return session.NowPlayingItem?.MediaStreams?.filter(
      (s) => s.Type === "Video",
    )[0];
  }, [session]);

  const audioStream = useMemo(() => {
    const index = session.PlayState?.AudioStreamIndex;
    return index !== null && index !== undefined
      ? session.NowPlayingItem?.MediaStreams?.[index]
      : undefined;
  }, [session.PlayState?.AudioStreamIndex]);

  const subtitleStream = useMemo(() => {
    const index = session.PlayState?.SubtitleStreamIndex;
    return index !== null && index !== undefined
      ? session.NowPlayingItem?.MediaStreams?.[index]
      : undefined;
  }, [session.PlayState?.SubtitleStreamIndex]);

  const isTranscoding = useMemo(() => {
    return (
      session.PlayState?.PlayMethod === "Transcode" && session.TranscodingInfo
    );
  }, [session.PlayState?.PlayMethod, session.TranscodingInfo]);

  const videoStreamTitle = () => {
    return videoStream?.DisplayTitle?.split(" ")[0];
  };

  return (
    <View className='flex flex-col bg-neutral-800 rounded-b-2xl p-4 pt-2'>
      <TranscodingStreamView
        title='Video'
        properties={{
          resolution: videoStreamTitle(),
          bitrate: videoStream?.BitRate,
          codec: videoStream?.Codec,
        }}
        transcodeProperties={{
          hwType: session.TranscodingInfo?.HardwareAccelerationType,
          bitrate: session.TranscodingInfo?.Bitrate,
          codec: session.TranscodingInfo?.VideoCodec,
        }}
        isTranscoding={
          !!(isTranscoding && !session.TranscodingInfo?.IsVideoDirect)
        }
      />

      <TranscodingStreamView
        title='Audio'
        properties={{
          language: audioStream?.Language,
          bitrate: audioStream?.BitRate,
          codec: audioStream?.Codec,
          audioChannels: audioStream?.ChannelLayout,
        }}
        transcodeProperties={{
          codec: session.TranscodingInfo?.AudioCodec,
          audioChannels: session.TranscodingInfo?.AudioChannels?.toString(),
        }}
        isTranscoding={
          !!(isTranscoding && !session.TranscodingInfo?.IsVideoDirect)
        }
      />

      {subtitleStream && (
        <TranscodingStreamView
          title='Subtitle'
          isTranscoding={false}
          properties={{
            language: subtitleStream?.Language,
            codec: subtitleStream?.Codec,
          }}
          transcodeValue={null}
        />
      )}
    </View>
  );
};
