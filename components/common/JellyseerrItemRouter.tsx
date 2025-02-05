import { useRouter, useSegments } from "expo-router";
import React, { PropsWithChildren, useCallback, useMemo } from "react";
import { TouchableOpacity, TouchableOpacityProps } from "react-native";
import * as ContextMenu from "@/components/ContextMenu";
import { MovieResult, TvResult } from "@/utils/jellyseerr/server/models/Search";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import {
  hasPermission,
  Permission,
} from "@/utils/jellyseerr/server/lib/permissions";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";

interface Props extends TouchableOpacityProps {
  result: MovieResult | TvResult;
  mediaTitle: string;
  releaseYear: number;
  canRequest: boolean;
  posterSrc: string;
}

export const TouchableJellyseerrRouter: React.FC<PropsWithChildren<Props>> = ({
  result,
  mediaTitle,
  releaseYear,
  canRequest,
  posterSrc,
  children,
  ...props
}) => {
  const router = useRouter();
  const segments = useSegments();
  const { jellyseerrApi, jellyseerrUser, requestMedia } = useJellyseerr();

  const from = segments[2];

  const autoApprove = useMemo(() => {
    return (
      jellyseerrUser &&
      hasPermission(Permission.AUTO_APPROVE, jellyseerrUser.permissions, {
        type: "or",
      })
    );
  }, [jellyseerrApi, jellyseerrUser]);

  const request = useCallback(
    () =>
      requestMedia(mediaTitle, {
        mediaId: result.id,
        mediaType: result.mediaType,
      }),
    [jellyseerrApi, result]
  );

  if (from === "(home)" || from === "(search)" || from === "(libraries)")
    return (
      <>
        <ContextMenu.Root>
          <ContextMenu.Trigger>
            <TouchableOpacity
              onPress={() => {
                // @ts-ignore
                router.push({
                  pathname: `/(auth)/(tabs)/${from}/jellyseerr/page`,
                  params: {
                    ...result,
                    mediaTitle,
                    releaseYear,
                    canRequest,
                    posterSrc,
                  },
                });
              }}
              {...props}
            >
              {children}
            </TouchableOpacity>
          </ContextMenu.Trigger>
          <ContextMenu.Content
            avoidCollisions
            alignOffset={0}
            collisionPadding={0}
            loop={false}
            key={"content"}
          >
            <ContextMenu.Label key="label-1">Actions</ContextMenu.Label>
            {canRequest && result.mediaType === MediaType.MOVIE && (
              <ContextMenu.Item
                key="item-1"
                onSelect={() => {
                  if (autoApprove) {
                    request();
                  }
                }}
                shouldDismissMenuOnSelect
              >
                <ContextMenu.ItemTitle key="item-1-title">
                  Request
                </ContextMenu.ItemTitle>
                <ContextMenu.ItemIcon
                  ios={{
                    name: "arrow.down.to.line",
                    pointSize: 18,
                    weight: "semibold",
                    scale: "medium",
                    hierarchicalColor: {
                      dark: "purple",
                      light: "purple",
                    },
                  }}
                  androidIconName="download"
                />
              </ContextMenu.Item>
            )}
          </ContextMenu.Content>
        </ContextMenu.Root>
      </>
    );
};
