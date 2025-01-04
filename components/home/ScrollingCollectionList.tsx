import { Text } from "@/components/common/Text";
import MoviePoster from "@/components/posters/MoviePoster";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  useQuery,
  type QueryFunction,
  type QueryKey,
} from "@tanstack/react-query";
import { ScrollView, View, ViewProps } from "react-native";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import { ItemCardText } from "../ItemCardText";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import SeriesPoster from "../posters/SeriesPoster";
import { useTranslation } from "react-i18next";

interface Props extends ViewProps {
  title?: string | null;
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  queryKey: QueryKey;
  queryFn: QueryFunction<BaseItemDto[]>;
  hideIfEmpty?: boolean;
}

export const ScrollingCollectionList: React.FC<Props> = ({
  title,
  orientation = "vertical",
  disabled = false,
  queryFn,
  queryKey,
  hideIfEmpty = false,
  ...props
}) => {
  const { data, isLoading } = useQuery({
    queryKey: queryKey,
    queryFn,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  if (disabled || !title) return null;

  if (hideIfEmpty === true && data?.length === 0) return null;

  const { t } = useTranslation();

  return (
    <View {...props}>
      <Text className="px-4 text-lg font-bold mb-2 text-neutral-100">
        {title}
      </Text>
      {isLoading === false && data?.length === 0 && (
        <View className="px-4">
          <Text className="text-neutral-500">{t("home.no_items")}</Text>
        </View>
      )}
      {isLoading ? (
        <View
          className={`
            flex flex-row gap-2 px-4
        `}
        >
          {[1, 2, 3].map((i) => (
            <View className="w-44" key={i}>
              <View className="bg-neutral-900 h-24 w-full rounded-md mb-1"></View>
              <View className="rounded-md overflow-hidden mb-1 self-start">
                <Text
                  className="text-neutral-900 bg-neutral-900 rounded-md"
                  numberOfLines={1}
                >
                  Nisi mollit voluptate amet.
                </Text>
              </View>
              <View className="rounded-md overflow-hidden self-start mb-1">
                <Text
                  className="text-neutral-900 bg-neutral-900 text-xs rounded-md "
                  numberOfLines={1}
                >
                  Lorem ipsum
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="px-4 flex flex-row">
            {data?.map((item) => (
              <TouchableItemRouter
                item={item}
                key={item.Id}
                className={`mr-2 
                  ${orientation === "horizontal" ? "w-44" : "w-28"}
                `}
              >
                {item.Type === "Episode" && orientation === "horizontal" && (
                  <ContinueWatchingPoster item={item} />
                )}
                {item.Type === "Episode" && orientation === "vertical" && (
                  <SeriesPoster item={item} />
                )}
                {item.Type === "Movie" && orientation === "horizontal" && (
                  <ContinueWatchingPoster item={item} />
                )}
                {item.Type === "Movie" && orientation === "vertical" && (
                  <MoviePoster item={item} />
                )}
                {item.Type === "Series" && <SeriesPoster item={item} />}
                {item.Type === "Program" && (
                  <ContinueWatchingPoster item={item} />
                )}
                <ItemCardText item={item} />
              </TouchableItemRouter>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
};
