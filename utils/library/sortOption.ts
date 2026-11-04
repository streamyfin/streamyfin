import { SortByOption, type SortOption } from "@/utils/atoms/filters";

/**
 * The sort key a screen should act on: the selected one when the shown list
 * has it, Name otherwise. The sort atoms are shared between screens, so a key
 * picked in another library (Date Episode Added in a Shows library) can reach
 * a screen whose list does not offer it, and would draw an empty label.
 */
export const resolveSortKey = (
  selected: SortByOption | undefined,
  options: readonly SortOption[],
): SortByOption =>
  selected && options.some((option) => option.key === selected)
    ? selected
    : SortByOption.SortName;
