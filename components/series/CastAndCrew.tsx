import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { router, useSegments } from "expo-router";
import { useAtom } from "jotai";
import React, { useMemo } from "react";
import { TouchableOpacity, View, ViewProps } from "react-native";
import { HorizontalScroll } from "../common/HorrizontalScroll";
import { Text } from "../common/Text";
import Poster from "../posters/Poster";
import { itemRouter } from "../common/TouchableItemRouter";
import { useTranslation } from "react-i18next";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
  loading?: boolean;
}

export const CastAndCrew: React.FC<Props> = ({ item, loading, ...props }) => {
  const [api] = useAtom(apiAtom);
  const segments = useSegments();
  const { t } = useTranslation();
  const from = segments[2];

  const destinctPeople = useMemo(() => {
    const people: BaseItemPerson[] = [];
    item?.People?.forEach((person) => {
      const existingPerson = people.find((p) => p.Id === person.Id);
      if (existingPerson) {
        existingPerson.Role = `${existingPerson.Role}, ${person.Role}`;
      } else {
        people.push(person);
      }
    });
    return people;
  }, [item?.People]);

  if (!from) return null;

  return (
    <View {...props} className="flex flex-col">
      <Text className="text-lg font-bold mb-2 px-4">{t("item_card.cast_and_crew")}</Text>
      <HorizontalScroll
        loading={loading}
        keyExtractor={(i, idx) => i.Id.toString()}
        height={247}
        data={destinctPeople}
        renderItem={(i) => (
          <TouchableOpacity
            onPress={() => {
              const url = itemRouter(i, from);
              // @ts-ignore
              router.push(url);
            }}
            className="flex flex-col w-28"
          >
            <Poster id={i.id} url={getPrimaryImageUrl({ api, item: i })} />
            <Text className="mt-2">{i.Name}</Text>
            <Text className="text-xs opacity-50">{i.Role}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};
