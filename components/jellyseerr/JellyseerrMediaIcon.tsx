import { useMemo } from "react";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { View, ViewProps } from "react-native";

const JellyseerrMediaIcon: React.FC<
  { mediaType: "tv" | "movie" } & ViewProps
> = ({ mediaType, className, ...props }) => {
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
          <MaterialCommunityIcons name="movie-open" size={16} color="white" />
        ) : (
          <Feather size={16} name="tv" color="white" />
        )}
      </View>
    )
  );
};

export default JellyseerrMediaIcon;
