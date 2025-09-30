import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { t } from "i18next";
import { useEffect, useMemo, useState } from "react";
import { Platform, TouchableOpacity, View } from "react-native";
import { Text } from "../common/Text";
import { type OptionGroup, PlatformOptionsMenu } from "../PlatformOptionsMenu";

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

  const optionGroups: OptionGroup[] = useMemo(
    () => [
      {
        id: "seasons",
        title: t("item_card.seasons"),
        options:
          seasons?.sort(sortByIndex).map((season: any) => {
            const title =
              season[keys.title] ||
              season.Name ||
              `Season ${season.IndexNumber}`;
            return {
              id: `${season.Id || season.IndexNumber}`,
              type: "radio" as const,
              groupId: "seasons",
              label: title,
              selected: Number(season[keys.index]) === Number(seasonIndex),
            };
          }) || [],
      },
    ],
    [seasons, keys, seasonIndex],
  );

  const handleSeasonSelect = (optionId: string) => {
    const selectedSeason = seasons?.find(
      (season: any) => `${season.Id || season.IndexNumber}` === optionId,
    );
    if (selectedSeason) {
      onSelect(selectedSeason);
    }
    setOpen(false);
  };

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

  const trigger = (
    <View className='flex flex-row'>
      <TouchableOpacity
        className='bg-neutral-900 rounded-2xl border-neutral-900 border px-3 py-2 flex flex-row items-center justify-between'
        onPress={() => setOpen(true)}
      >
        <Text>
          {t("item_card.season")} {seasonIndex}
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (isTv) return null;

  return (
    <PlatformOptionsMenu
      groups={optionGroups}
      trigger={trigger}
      title={t("item_card.seasons")}
      open={open}
      onOpenChange={setOpen}
      onOptionSelect={handleSeasonSelect}
      expoUIConfig={{
        hostStyle: { flex: 1 },
      }}
      bottomSheetConfig={{
        enableDynamicSizing: true,
        enablePanDownToClose: true,
      }}
    />
  );
};
