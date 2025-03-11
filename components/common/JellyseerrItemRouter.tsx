import { useRouter, useSegments } from "expo-router";
import React, { PropsWithChildren, useCallback, useMemo, useState } from "react";
import { TouchableOpacity, TouchableOpacityProps, Platform, Pressable } from "react-native";
import * as ContextMenu from "@/components/ContextMenu";
import { MovieResult, TvResult } from "@/utils/jellyseerr/server/models/Search";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import {
  hasPermission,
  Permission,
} from "@/utils/jellyseerr/server/lib/permissions";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import { TvDetails } from "@/utils/jellyseerr/server/models/Tv";
import { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import { Colors } from "@/constants/Colors";

interface Props extends TouchableOpacityProps {
  result?: MovieResult | TvResult | MovieDetails | TvDetails;
  mediaTitle: string;
  releaseYear: number;
  canRequest: boolean;
  posterSrc: string;
  mediaType: MediaType;
}

export const TouchableJellyseerrRouter: React.FC<PropsWithChildren<Props>> = ({
  result,
  mediaTitle,
  releaseYear,
  canRequest,
  posterSrc,
  mediaType,
  children,
  style,
  ...props
}) => {
  const router = useRouter();
  const segments = useSegments();
  const { jellyseerrApi, jellyseerrUser, requestMedia } = useJellyseerr();
  const [isFocused, setIsFocused] = useState(false);

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
    () => {
      if (!result) return;
      requestMedia(mediaTitle, {
        mediaId: result.id,
        mediaType,
      })
    },
    [jellyseerrApi, result]
  );

  const handlePress = () => {
    if (!result) return;

    // @ts-ignore
    router.push({
      pathname: `/(auth)/(tabs)/${from}/jellyseerr/page`,
      params: {
        ...result,
        mediaTitle,
        releaseYear,
        canRequest,
        posterSrc,
        mediaType
      },
    });
  };

  // For TV platforms, use a Pressable with focus handling
  if (Platform.isTV) {
    return (
      <Pressable
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onPress={handlePress}
        style={[
          { padding: 4 },
          isFocused && { 
            transform: [{ scale: 1.05 }],
            borderWidth: 2,
            borderColor: Colors.primary,
            borderRadius: 8,
          },
          style
        ]}
        {...props}
      >
        {children}
      </Pressable>
    );
  }

  // For mobile platforms, use the original implementation with context menu
  if (from === "(home)" || from === "(search)" || from === "(libraries)")
    return (
      <>
        <ContextMenu.Root>
          <ContextMenu.Trigger>
            <TouchableOpacity
              onPress={handlePress}
              style={style}
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
            {canRequest && mediaType === MediaType.MOVIE && (
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