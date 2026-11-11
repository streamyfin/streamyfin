import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMemo, useRef } from "react";
import { View } from "react-native";
import {
  LIVE_TV_GUIDE_HOUR_WIDTH,
  LIVE_TV_GUIDE_PINNED_TITLE_MIN_WIDTH,
} from "@/constants/LiveTVGuide";
import { Text } from "../common/Text";
import { TouchableItemRouter } from "../common/TouchableItemRouter";

const HOUR_MS = 3_600_000;

/** The guide width a span of time takes. */
const toGuideWidth = (ms: number) => (ms / HOUR_MS) * LIVE_TV_GUIDE_HOUR_WIDTH;

export const LiveTVGuideRow = ({
  channel,
  programs,
  startTime,
  scrollX = 0,
  isVisible = true,
}: {
  channel: BaseItemDto;
  programs?: BaseItemDto[] | null;
  /** The guide's first hour, the one `HourHeader` starts at. */
  startTime: number;
  scrollX?: number;
  isVisible?: boolean;
}) => {
  const _positionRefs = useRef<{ [key: string]: number }>({});

  // Each program sits at its start time, counted from the guide's first hour:
  // summed from the channel's first program, a program that began before that
  // hour or a gap in the listing moved every later one against the header.
  const programsWithPositions = useMemo(
    () =>
      programs
        ?.filter((p) => p.ChannelId === channel.Id)
        .flatMap((p) => {
          if (!p.StartDate || !p.EndDate) return [];
          // A program already running at the first hour starts at the edge.
          const start = Math.max(new Date(p.StartDate).getTime(), startTime);
          const end = new Date(p.EndDate).getTime();
          if (end <= start) return [];
          return [
            {
              ...p,
              position: toGuideWidth(start - startTime),
              width: toGuideWidth(end - start),
            },
          ];
        }),
    [programs, channel.Id, startTime],
  );

  // How far a title follows the left edge into its program, keeping it the
  // room it needs: a short program never moves its title.
  const pinnedTitleOffset = (position: number, width: number) =>
    Math.min(
      Math.max(scrollX - position, 0),
      Math.max(width - LIVE_TV_GUIDE_PINNED_TITLE_MIN_WIDTH, 0),
    );

  const isCurrentlyLive = (program: BaseItemDto) => {
    if (!program.StartDate || !program.EndDate) return false;
    const now = new Date();
    const start = new Date(program.StartDate);
    const end = new Date(program.EndDate);
    return now >= start && now <= end;
  };

  if (!isVisible) {
    return <View style={{ height: 64 }} />;
  }

  return (
    <View key={channel.ChannelNumber} className='flex flex-row h-16'>
      {programsWithPositions?.map((p) => (
        <TouchableItemRouter item={p} key={p.Id}>
          <View
            style={{
              width: p.width,
              height: "100%",
              position: "absolute",
              left: p.position,
              backgroundColor: isCurrentlyLive(p)
                ? "rgba(255, 255, 255, 0.1)"
                : "transparent",
            }}
            className='flex flex-col items-center justify-center border border-neutral-800 overflow-hidden'
          >
            {(() => {
              return (
                <View
                  style={{
                    marginLeft: pinnedTitleOffset(p.position, p.width),
                  }}
                  className='px-4 self-start'
                >
                  <Text
                    numberOfLines={2}
                    className='text-xs text-start self-start'
                  >
                    {p.Name}
                  </Text>
                </View>
              );
            })()}
          </View>
        </TouchableItemRouter>
      ))}
    </View>
  );
};
