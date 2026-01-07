import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { t } from "i18next";
import { useEffect, useMemo, useState } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import { Text } from "../common/Text";
import { PlatformDropdown } from "../PlatformDropdown";

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
  const isTv = Platform.isTV;
  const [open, setOpen] = useState(false);

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
    [item],
  );

  const seasonIndex = useMemo(
    () => state[(item[keys.id] as string) ?? ""],
    [state, item, keys],
  );

  const sortByIndex = (a: BaseItemDto, b: BaseItemDto) =>
    Number(a[keys.index]) - Number(b[keys.index]);

  const optionGroups = useMemo(
    () => [
      {
        options:
          seasons?.sort(sortByIndex).map((season: any) => {
            const title =
              season[keys.title] ||
              season.Name ||
              `Season ${season.IndexNumber}`;
            return {
              type: "radio" as const,
              label: title,
              value: season.Id || season.IndexNumber,
              selected: Number(season[keys.index]) === Number(seasonIndex),
              onPress: () => onSelect(season),
            };
          }) || [],
      },
    ],
    [seasons, keys, seasonIndex, onSelect],
  );

  useEffect(() => {
    if (isTv) return;
    if (seasons && seasons.length > 0 && seasonIndex === undefined) {
      let initialIndex: number | undefined;

      if (initialSeasonIndex !== undefined) {
        // Use the provided initialSeasonIndex if it exists in the seasons
        const seasonExists = seasons.some(
          (season: any) => season[keys.index] === initialSeasonIndex,
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
          (season: any) => season[keys.index] === initialIndex,
        );
        if (initialSeason) onSelect(initialSeason!);
        else throw Error("Initial index could not be found!");
      }
    }
  }, [
    isTv,
    seasons,
    seasonIndex,
    item,
    item[keys.id],
    initialSeasonIndex,
    keys,
  ]);

  if (isTv) return null;

  return (
    <PlatformDropdown
      groups={optionGroups}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <TouchableOpacity onPress={() => setOpen(true)}>
          <View className='bg-neutral-900 rounded-2xl border-neutral-900 border px-3 py-2 flex flex-row items-center justify-between'>
            <Text>
              {t("item_card.season")} {seasonIndex}
            </Text>
          </View>
        </TouchableOpacity>
      }
      title={t("item_card.seasons")}
    />
  );
};
