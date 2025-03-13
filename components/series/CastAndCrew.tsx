import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import {
  BaseItemDto,
  BaseItemPerson,
} from "@jellyfin/sdk/lib/generated-client/models";
import { router, useSegments } from "expo-router";
import { useAtom } from "jotai";
import React, { useMemo, useRef } from "react";
import { TouchableOpacity, View, ViewProps, Platform } from "react-native";
import { HorizontalScroll } from "../common/HorrizontalScroll";
import { Text } from "../common/Text";
import Poster from "../posters/Poster";
import { itemRouter } from "../common/TouchableItemRouter";
import { useTranslation } from "react-i18next";
import { TVFocusable } from "../common/TVFocusable";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
  loading?: boolean;
}

export const CastAndCrew: React.FC<Props> = ({ item, loading, ...props }) => {
  const [api] = useAtom(apiAtom);
  const segments = useSegments();
  const { t } = useTranslation();
  const from = segments[2];
  const firstItemRef = useRef(null);

  const distinctPeople = useMemo(() => {
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

  const handlePersonSelect = (person: BaseItemPerson) => {
    const url = itemRouter(person, from);
    // @ts-ignore
    router.push(url);
  };

  const renderPerson = (person: BaseItemPerson, index: number) => {
    const content = (
      <View className="flex flex-col w-28">
        <Poster
          id={person.id}
          url={getPrimaryImageUrl({ api, item: person })}
        />
        <Text className="mt-2">{person.Name}</Text>
        <Text className="text-xs opacity-50">{person.Role}</Text>
      </View>
    );

    if (Platform.isTV) {
      return (
        <TVFocusable
          key={person.Id || index}
          hasTVPreferredFocus={index === 0}
          onSelect={() => handlePersonSelect(person)}
        >
          {content}
        </TVFocusable>
      );
    }

    return (
      <TouchableOpacity
        key={person.Id || index}
        onPress={() => handlePersonSelect(person)}
      >
        {content}
      </TouchableOpacity>
    );
  };

  return (
    <View {...props} className="flex flex-col">
      <Text className="text-lg font-bold mb-2 px-4">
        {t("item_card.cast_and_crew")}
      </Text>
      <HorizontalScroll
        loading={loading}
        keyExtractor={(i) => i.Id?.toString() || ""}
        height={247}
        data={distinctPeople}
        renderItem={renderPerson}
      />
    </View>
  );
};
