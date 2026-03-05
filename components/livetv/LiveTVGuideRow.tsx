import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import { Dimensions, View } from "react-native";
import { Text } from "../common/Text";
import { TouchableItemRouter } from "../common/TouchableItemRouter";

type RealEntry = BaseItemDto & {
  isDummy: false;
  width: number;
  position: number;
};
type DummyEntry = {
  isDummy: true;
  width: number;
  position: number;
  Id: string;
  startTime: Date;
  endTime: Date;
};
type GuideEntry = RealEntry | DummyEntry;

const EPG_PX_PER_HOUR = 200;

const datesToPx = (start: Date, end: Date): number =>
  Math.max(
    0,
    ((end.getTime() - start.getTime()) / 60000 / 60) * EPG_PX_PER_HOUR,
  );

const isCurrentlyLive = (program: BaseItemDto, now: Date): boolean => {
  if (!program.StartDate || !program.EndDate) return false;
  return now >= new Date(program.StartDate) && now <= new Date(program.EndDate);
};

export const LiveTVGuideRow = ({
  channel,
  programs,
  scrollX = 0,
  isVisible = true,
}: {
  channel: BaseItemDto;
  programs?: BaseItemDto[] | null;
  scrollX?: number;
  isVisible?: boolean;
}) => {
  const screenWidth = Dimensions.get("window").width;

  const referenceTime = useMemo(() => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    return now;
  }, []);

  const programsWithGaps = useMemo((): GuideEntry[] => {
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const channelPrograms = (programs ?? [])
      .filter((p) => p.ChannelId === channel.Id)
      .sort(
        (a, b) =>
          new Date(a.StartDate ?? 0).getTime() -
          new Date(b.StartDate ?? 0).getTime(),
      );

    const result: GuideEntry[] = [];
    let prevEndTime = new Date(referenceTime);

    for (const program of channelPrograms) {
      const programStart = new Date(program.StartDate ?? 0);
      const programEnd = new Date(program.EndDate ?? 0);
      const effectiveStart =
        programStart > referenceTime ? programStart : referenceTime;

      // Fill gap before this program
      if (effectiveStart > prevEndTime) {
        const gapWidth = datesToPx(prevEndTime, effectiveStart);
        if (gapWidth > 0) {
          result.push({
            isDummy: true,
            width: gapWidth,
            position: datesToPx(referenceTime, prevEndTime),
            Id: `gap-${channel.Id}-${prevEndTime.getTime()}`,
            startTime: new Date(prevEndTime),
            endTime: new Date(effectiveStart),
          });
        }
      }

      result.push({
        ...program,
        isDummy: false,
        width: datesToPx(effectiveStart, programEnd),
        position: datesToPx(referenceTime, effectiveStart),
      });

      if (programEnd > prevEndTime) prevEndTime = new Date(programEnd);
    }

    // Fill remaining time after last program
    if (prevEndTime < endOfDay) {
      const remainingWidth = datesToPx(prevEndTime, endOfDay);
      if (remainingWidth > 0) {
        result.push({
          isDummy: true,
          width: remainingWidth,
          position: datesToPx(referenceTime, prevEndTime),
          Id: `gap-end-${channel.Id}`,
          startTime: new Date(prevEndTime),
          endTime: new Date(endOfDay),
        });
      }
    }

    // Empty channel – fill entire visible time range
    if (result.length === 0) {
      result.push({
        isDummy: true,
        width: Math.max(datesToPx(referenceTime, endOfDay), EPG_PX_PER_HOUR),
        position: 0,
        Id: `empty-${channel.Id}`,
        startTime: new Date(referenceTime),
        endTime: new Date(endOfDay),
      });
    }

    return result;
  }, [programs, channel.Id, referenceTime]);

  if (!isVisible) {
    return <View style={{ height: 64 }} />;
  }

  const now = new Date();

  return (
    <View key={channel.ChannelNumber} className='flex flex-row h-16'>
      {programsWithGaps.map((entry) => {
        if (entry.isDummy) {
          const isLive = now >= entry.startTime && now <= entry.endTime;
          return (
            <TouchableItemRouter item={channel} key={entry.Id}>
              <View
                style={{
                  width: entry.width,
                  height: "100%",
                  position: "absolute",
                  left: entry.position,
                  backgroundColor: isLive
                    ? "rgba(255, 255, 255, 0.1)"
                    : "transparent",
                }}
                className='flex flex-col items-center justify-center border border-neutral-800 overflow-hidden'
              />
            </TouchableItemRouter>
          );
        }

        return (
          <TouchableItemRouter item={entry} key={entry.Id}>
            <View
              style={{
                width: entry.width,
                height: "100%",
                position: "absolute",
                left: entry.position,
                backgroundColor: isCurrentlyLive(entry, now)
                  ? "rgba(255, 255, 255, 0.1)"
                  : "transparent",
              }}
              className='flex flex-col items-center justify-center border border-neutral-800 overflow-hidden'
            >
              <View
                style={{
                  marginLeft:
                    entry.width > screenWidth && scrollX > entry.position
                      ? scrollX - entry.position
                      : 0,
                }}
                className='px-4 self-start'
              >
                <Text
                  numberOfLines={2}
                  className='text-xs text-start self-start'
                >
                  {entry.Name}
                </Text>
              </View>
            </View>
          </TouchableItemRouter>
        );
      })}
    </View>
  );
};
