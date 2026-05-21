import { useSegments } from "expo-router";
import type React from "react";
import { type PropsWithChildren } from "react";
import { TouchableOpacity, type TouchableOpacityProps } from "react-native";
import useRouter from "@/hooks/useAppRouter";
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

export const TouchableSeerrRouter: React.FC<PropsWithChildren<Props>> = ({
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

          // Build URL with query params - avoids Expo Router's strict type checking.
          // Every value is coerced defensively: releaseYear/mediaType can be
          // undefined or NaN at runtime, so `.toString()` would throw.
          const params = new URLSearchParams({
            ...Object.fromEntries(
              Object.entries(result).map(([key, value]) => [
                key,
                String(value ?? ""),
              ]),
            ),
            mediaTitle: mediaTitle ?? "",
            releaseYear: String(releaseYear ?? ""),
            canRequest: String(canRequest ?? false),
            posterSrc: posterSrc ?? "",
            mediaType: String(mediaType ?? ""),
          });

          router.push(
            `/(auth)/(tabs)/(home,libraries,search,favorites,watchlists)/seerr/page?${params.toString()}`,
          );
        }}
        {...props}
      >
        {children}
      </TouchableOpacity>
    );

  return null;
};
