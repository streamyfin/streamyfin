import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useMemo } from "react";
import { FilterButton } from "@/components/filters/FilterButton";
import { useOfficialRatingOptions } from "@/hooks/useOfficialRatingOptions";
import { withSelectedRatings } from "@/utils/library/officialRatings";

interface Props {
  libraryId: string;
  collectionType: BaseItemDto["CollectionType"];
  /** False until the library has loaded. */
  enabled: boolean;
  values: string[];
  set: (values: string[]) => void;
  title: string;
}

/**
 * The library page's official ratings chip. It reads the ratings itself, not
 * through the filter bar: the bar is rebuilt whenever one of its inputs
 * changes, so the ratings arriving there remounted every chip in it.
 */
export const OfficialRatingsFilterButton = ({
  libraryId,
  collectionType,
  enabled,
  values,
  set,
  title,
}: Props) => {
  const ratings = useOfficialRatingOptions(libraryId, collectionType, enabled);
  // A saved pick the server no longer lists still filters the grid, so it
  // stays among the choices, where it can be taken back.
  const options = useMemo(
    () => withSelectedRatings(ratings ?? [], values),
    [ratings, values],
  );

  return (
    <FilterButton
      className='mr-1'
      id={libraryId}
      queryKey='officialRatingFilter'
      options={options}
      set={set}
      values={values}
      title={title}
      renderItemLabel={(item) => item}
      multiple
    />
  );
};
