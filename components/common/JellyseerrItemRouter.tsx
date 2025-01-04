import { useRouter, useSegments } from "expo-router";
import React, { PropsWithChildren, useCallback, useMemo } from "react";
import { TouchableOpacity, TouchableOpacityProps } from "react-native";
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
      </>
    );
};
