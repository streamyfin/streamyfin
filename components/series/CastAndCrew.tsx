import type {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { router, useSegments } from "expo-router";
import { useAtom } from "jotai";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { POSTER_CAROUSEL_HEIGHT } from "@/constants/Values";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { HorizontalScroll } from "../common/HorizontalScroll";
import { Text } from "../common/Text";
import Poster from "../posters/Poster";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
  loading?: boolean;
}

export const CastAndCrew: React.FC<Props> = ({ item, loading, ...props }) => {
  const [api] = useAtom(apiAtom);
  const segments = useSegments();
  const { t } = useTranslation();
  const from = (segments as string[])[2];

  const destinctPeople = useMemo(() => {
    const people: Record<string, BaseItemPerson> = {};
    item?.People?.forEach((person) => {
      if (!person.Id) return;

      const existingPerson = people[person.Id];
      if (existingPerson) {
        existingPerson.Role = `${existingPerson.Role}, ${person.Role}`;
      } else {
        people[person.Id] = person;
      }
    });
    return Object.values(people);
  }, [item?.People]);

  if (!from) return null;

  return (
    <View {...props} className='flex flex-col'>
      <Text className='text-lg font-bold mb-2 px-4'>
        {t("item_card.cast_and_crew")}
      </Text>
      <HorizontalScroll
        loading={loading}
        keyExtractor={(i, _idx) => i.Id?.toString() || ""}
        height={POSTER_CAROUSEL_HEIGHT}
        data={destinctPeople}
        renderItem={(i) => (
          <TouchableOpacity
            onPress={() => {
              if (i.Id) {
                router.push({
                  pathname: "/persons/[personId]",
                  params: { personId: i.Id },
                });
              }
            }}
            className='flex flex-col w-28'
          >
            <Poster id={i.Id} url={getPrimaryImageUrl({ api, item: i })} />
            <Text className='mt-2' numberOfLines={1}>
              {i.Name}
            </Text>
            <Text className='text-xs opacity-50' numberOfLines={1}>
              {i.Role}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};
