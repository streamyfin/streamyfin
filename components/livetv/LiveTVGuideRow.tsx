import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMemo, useRef } from "react";
import { Dimensions, View } from "react-native";
import { Text } from "../common/Text";
import { TouchableItemRouter } from "../common/TouchableItemRouter";

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
  const positionRefs = useRef<{ [key: string]: number }>({});
  const screenWidth = Dimensions.get("window").width;

  const calculateWidth = (s?: string | null, e?: string | null) => {
    if (!s || !e) return 0;
    const start = new Date(s);
    const end = new Date(e);
    const duration = end.getTime() - start.getTime();
    const minutes = duration / 60000;
    const width = (minutes / 60) * 200;
    return width;
  };

  const programsWithPositions = useMemo(() => {
    let cumulativeWidth = 0;
    return programs
      ?.filter((p) => p.ChannelId === channel.Id)
      .map((p) => {
        const width = calculateWidth(p.StartDate, p.EndDate);
        const position = cumulativeWidth;
        cumulativeWidth += width;
        return { ...p, width, position };
      });
  }, [programs, channel.Id]);

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
                    marginLeft:
                      p.width > screenWidth && scrollX > p.position
                        ? scrollX - p.position
                        : 0,
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
