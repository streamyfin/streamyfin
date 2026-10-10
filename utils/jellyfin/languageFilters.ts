import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  BaseItemKind,
  NameValuePair,
  QueryFilters,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getFilterApi } from "@jellyfin/sdk/lib/utils/api";
import type { RawAxiosRequestConfig } from "axios";

export interface LanguageFilterOption {
  /** What the server filters on: the language tag stored on the stream. */
  value: string;
  /** What the user reads, already localized by the server. */
  label: string;
}

export interface LanguageFilters {
  audio: LanguageFilterOption[];
  subtitle: LanguageFilterOption[];
}

export const NO_LANGUAGE_FILTERS: LanguageFilters = { audio: [], subtitle: [] };

// SDK 0.13 was generated before Jellyfin 12 and knows neither the two language
// lists on Filters2 nor the two query parameters on /Items. SDK 1.0.0 types
// both: this type and languageFilterRequestOptions() go away with that bump.
type QueryFiltersWithLanguages = QueryFilters & {
  AudioLanguages?: NameValuePair[] | null;
  SubtitleLanguages?: NameValuePair[] | null;
};

/**
 * The item types to ask Filters2 about for a library, or null when the library
 * has no language filters.
 *
 * The server only fills the language lists when the request names Movie,
 * Series, Season or Episode, so the types are not optional: a Filters2 call
 * without them answers with two empty lists. The set mirrors jellyfin-web,
 * which offers the filters on movie, show and mixed libraries.
 */
export const getLanguageFilterItemTypes = (
  library: Pick<BaseItemDto, "Type" | "CollectionType"> | null | undefined,
): BaseItemKind[] | null => {
  if (!library) return null;
  if (library.CollectionType === "movies") return ["Movie"];
  if (library.CollectionType === "tvshows") return ["Series"];
  // A mixed library is a collection folder without a collection type. The Type
  // check keeps out a playlist, which this screen also renders and which has
  // no collection type either.
  if (library.Type === "CollectionFolder" && !library.CollectionType) {
    return ["Movie", "Series"];
  }
  return null;
};

const toOptions = (
  pairs: NameValuePair[] | null | undefined,
): LanguageFilterOption[] =>
  (pairs ?? []).flatMap((pair) =>
    pair.Value ? [{ value: pair.Value, label: pair.Name || pair.Value }] : [],
  );

export const fetchLanguageFilters = async (
  api: Api,
  request: {
    userId?: string;
    parentId: string;
    includeItemTypes: BaseItemKind[];
  },
): Promise<LanguageFilters> => {
  const response = await getFilterApi(api).getQueryFilters(request);
  const filters: QueryFiltersWithLanguages = response.data ?? {};
  return {
    audio: toOptions(filters.AudioLanguages),
    subtitle: toOptions(filters.SubtitleLanguages),
  };
};

/**
 * The library's languages plus any selected one it no longer reports, under
 * its tag, so a saved selection can always be seen and taken back.
 */
export const withSelectedLanguages = (
  options: LanguageFilterOption[],
  selected: string[],
): LanguageFilterOption[] => {
  const missing = selected.filter(
    (value) => !options.some((option) => option.value === value),
  );
  if (missing.length === 0) return options;
  return [...options, ...missing.map((value) => ({ value, label: value }))];
};

export const getLanguageFilterLabel = (
  options: LanguageFilterOption[],
  value: string,
) => options.find((option) => option.value === value)?.label ?? value;

/**
 * Carries the selected languages to getItems as its second argument.
 *
 * They cannot ride on the request object: SDK 0.13 reads every parameter off
 * it by name, so an unknown key cast onto it never reaches the URL and the
 * filter silently does nothing. Axios appends `params` to the query string the
 * SDK built, and the server splits a comma delimited value itself.
 */
export const languageFilterRequestOptions = ({
  audioLanguages,
  subtitleLanguages,
}: {
  audioLanguages: string[];
  subtitleLanguages: string[];
}): RawAxiosRequestConfig | undefined => {
  const params: Record<string, string> = {};
  if (audioLanguages.length > 0) {
    params.audioLanguages = audioLanguages.join(",");
  }
  if (subtitleLanguages.length > 0) {
    params.subtitleLanguages = subtitleLanguages.join(",");
  }
  return Object.keys(params).length > 0 ? { params } : undefined;
};
