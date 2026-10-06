import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useMemo } from "react";
import { View, type ViewProps } from "react-native";
import { MediaType } from "@/utils/seerr/types";

const SeerrMediaIcon: React.FC<
  {
    mediaType?: "tv" | "movie";
    /** Drawn smaller, over a poster, so the poster shows. */
    small?: boolean;
  } & ViewProps
> = ({ mediaType, small = false, className, ...props }) => {
  const style = useMemo(
    () =>
      mediaType === MediaType.MOVIE
        ? "bg-blue-600/90 border-blue-400/40"
        : "bg-purple-600/90 border-purple-400/40",
    [mediaType],
  );
  return (
    mediaType && (
      <View
        className={`${className} border ${style} rounded-full p-1`}
        {...props}
      >
        {mediaType === MediaType.MOVIE ? (
          <MaterialCommunityIcons
            name='movie-open'
            size={small ? 12 : 16}
            color='white'
          />
        ) : (
          <Feather size={small ? 12 : 16} name='tv' color='white' />
        )}
      </View>
    )
  );
};

export default SeerrMediaIcon;
