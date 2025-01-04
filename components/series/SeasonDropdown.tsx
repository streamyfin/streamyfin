import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useEffect, useMemo, useState } from "react";
import { TouchableOpacity, View, Modal } from "react-native";
import { Text } from "../common/Text";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  item: BaseItemDto;
  seasons: BaseItemDto[];
  initialSeasonIndex?: number;
  state: SeasonIndexState;
  onSelect: (season: BaseItemDto) => void;
};

type SeasonKeys = {
  id: keyof BaseItemDto;
  title: keyof BaseItemDto;
  index: keyof BaseItemDto;
};

export type SeasonIndexState = {
  [seriesId: string]: number | string | null | undefined;
};

export const SeasonDropdown: React.FC<Props> = ({
  item,
  seasons,
  initialSeasonIndex,
  state,
  onSelect,
}) => {
  const [isModalVisible, setIsModalVisible] = useState(false);

  const keys = useMemo<SeasonKeys>(
    () =>
      item.Type === "Episode"
        ? {
            id: "ParentId",
            title: "SeasonName",
            index: "ParentIndexNumber",
          }
        : {
            id: "Id",
            title: "Name",
            index: "IndexNumber",
          },
    [item]
  );

  const seasonIndex = useMemo(
    () => state[(item[keys.id] as string) ?? ""],
    [state]
  );

  useEffect(() => {
    if (seasons && seasons.length > 0 && seasonIndex === undefined) {
      let initialIndex: number | undefined;

      if (initialSeasonIndex !== undefined) {
        const seasonExists = seasons.some(
          (season: any) => season[keys.index] === initialSeasonIndex
        );
        if (seasonExists) {
          initialIndex = initialSeasonIndex;
        }
      }

      if (initialIndex === undefined) {
        const season1 = seasons.find((season: any) => season[keys.index] === 1);
        const season0 = seasons.find((season: any) => season[keys.index] === 0);
        const firstSeason = season1 || season0 || seasons[0];
        onSelect(firstSeason);
      }

      if (initialIndex !== undefined) {
        const initialSeason = seasons.find(
          (season: any) => season[keys.index] === initialIndex
        );

        if (initialSeason) onSelect(initialSeason!);
        else throw Error("Initial index could not be found!");
      }
    }
  }, [seasons, seasonIndex, item[keys.id], initialSeasonIndex]);

  const sortByIndex = (a: BaseItemDto, b: BaseItemDto) =>
    Number(a[keys.index]) - Number(b[keys.index]);

  return (
    <>
      <TouchableOpacity
        className="bg-neutral-900 rounded-2xl border-neutral-900 border px-3 py-2 flex flex-row items-center justify-between"
        onPress={() => setIsModalVisible(true)}
      >
        <Text>Season {seasonIndex}</Text>
        <Ionicons
          name="chevron-down"
          size={16}
          color="white"
          style={{ opacity: 0.5, marginLeft: 8 }}
        />
      </TouchableOpacity>

      <Modal
        visible={isModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/50"
          activeOpacity={1}
          onPress={() => setIsModalVisible(false)}
        >
          <View className="mt-auto bg-neutral-900 rounded-t-xl">
            <View className="p-4 border-b border-neutral-800">
              <Text className="text-lg font-bold text-center">
                Select Season
              </Text>
            </View>

            <View className="max-h-[50%]">
              {seasons?.sort(sortByIndex).map((season: any) => (
                <TouchableOpacity
                  key={season[keys.title]}
                  className="p-4 border-b border-neutral-800 flex-row items-center justify-between"
                  onPress={() => {
                    onSelect(season);
                    setIsModalVisible(false);
                  }}
                >
                  <Text>{season[keys.title]}</Text>
                  {Number(season[keys.index]) === Number(seasonIndex) && (
                    <Ionicons name="checkmark" size={24} color="white" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              className="p-4 border-t border-neutral-800"
              onPress={() => setIsModalVisible(false)}
            >
              <Text className="text-center text-purple-400">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
};
