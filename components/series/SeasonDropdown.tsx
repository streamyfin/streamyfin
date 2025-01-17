import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useEffect, useMemo } from "react";
import { TouchableOpacity, View } from "react-native";
import * as DropdownMenu from "zeego/dropdown-menu";
import { Text } from "../common/Text";
import { t } from "i18next";

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
        // Use the provided initialSeasonIndex if it exists in the seasons
        const seasonExists = seasons.some(
          (season: any) => season[keys.index] === initialSeasonIndex
        );
        if (seasonExists) {
          initialIndex = initialSeasonIndex;
        }
      }

      if (initialIndex === undefined) {
        // Fall back to the previous logic if initialIndex is not set
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
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <View className="flex flex-row">
          <TouchableOpacity className="bg-neutral-900 rounded-2xl border-neutral-900 border px-3 py-2 flex flex-row items-center justify-between">
            <Text>{t("item_card.season")} {seasonIndex}</Text>
          </TouchableOpacity>
        </View>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        loop={true}
        side="bottom"
        align="start"
        alignOffset={0}
        avoidCollisions={true}
        collisionPadding={8}
        sideOffset={8}
      >
        <DropdownMenu.Label>{t("item_card.seasons")}</DropdownMenu.Label>
        {seasons?.sort(sortByIndex).map((season: any) => (
          <DropdownMenu.Item
            key={season[keys.title]}
            onSelect={() => onSelect(season)}
          >
            <DropdownMenu.ItemTitle>
              {season[keys.title]}
            </DropdownMenu.ItemTitle>
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};
