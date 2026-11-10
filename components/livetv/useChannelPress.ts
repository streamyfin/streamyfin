import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useSegments } from "expo-router";
import { useCallback } from "react";
import { itemRouter } from "@/components/common/TouchableItemRouter";
import useRouter from "@/hooks/useAppRouter";

export const channelPlayerHref = (
  channelId: string | null | undefined,
): `/player/direct-player?${string}` =>
  `/player/direct-player?itemId=${channelId}&audioIndex=0&subtitleIndex=-1&mediaSourceId=&bitrateValue=&playbackPosition=0&offline=false`;

/** A tap plays the channel live, a long press opens what it is airing. */
export const useChannelPress = (channel: BaseItemDto) => {
  const router = useRouter();
  const segments = useSegments();

  const onPress = useCallback(() => {
    router.push(channelPlayerHref(channel.Id));
  }, [channel.Id, router]);

  const onLongPress = useCallback(() => {
    const target = channel.CurrentProgram ?? channel;
    const from = (segments as string[])[2] || "(home)";
    router.push(itemRouter(target, from) as any);
  }, [channel, segments, router]);

  return { onPress, onLongPress };
};
