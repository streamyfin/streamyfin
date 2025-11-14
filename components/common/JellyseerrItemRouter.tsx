import { useRouter, useSegments } from "expo-router";
import type React from "react";
import { type PropsWithChildren } from "react";
import { TouchableOpacity, type TouchableOpacityProps } from "react-native";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import { PersonCreditCast } from "@/utils/jellyseerr/server/models/Person";
import type {
  MovieResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import type { TvDetails } from "@/utils/jellyseerr/server/models/Tv";

interface Props extends TouchableOpacityProps {
  result?: MovieResult | TvResult | MovieDetails | TvDetails | PersonCreditCast;
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
  ...props
}) => {
  const router = useRouter();
  const segments = useSegments();

  const from = (segments as string[])[2] || "(home)";

  if (from === "(home)" || from === "(search)" || from === "(libraries)")
    return (
      <TouchableOpacity
        onPress={() => {
          if (!result) return;

          router.push({
            pathname: `/(auth)/(tabs)/${from}/jellyseerr/page`,
            // @ts-expect-error
            params: {
              ...result,
              mediaTitle,
              releaseYear,
              canRequest: canRequest.toString(),
              posterSrc,
              mediaType,
            },
          });
        }}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );

  return null;
};
