import { View, ViewProps } from "react-native";
import { MovieDetails } from "@/utils/jellyseerr/server/models/Movie";
import { TvDetails } from "@/utils/jellyseerr/server/models/Tv";
import { Text } from "@/components/common/Text";
import { useMemo } from "react";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { uniqBy } from "lodash";
import { TmdbRelease } from "@/utils/jellyseerr/server/api/themoviedb/interfaces";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import CountryFlag from "react-native-country-flag";
import { ANIME_KEYWORD_ID } from "@/utils/jellyseerr/server/api/themoviedb/constants";

interface Release {
  certification: string;
  iso_639_1?: string;
  note?: string;
  release_date: string;
  type: number;
}

const dateOpts: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

const Facts: React.FC<
  { title: string; facts?: string[] | React.ReactNode[] } & ViewProps
> = ({ title, facts, ...props }) =>
  facts &&
  facts?.length > 0 && (
    <View className="flex flex-col justify-between py-2" {...props}>
      <Text className="font-bold text-start">{title}</Text>

      <View className="flex flex-col items-end">
        {facts.map((f, idx) =>
          typeof f === "string" ? <Text key={idx}>{f}</Text> : f
        )}
      </View>
    </View>
  );

const Fact: React.FC<{ title: string; fact?: string | null } & ViewProps> = ({
  title,
  fact,
  ...props
}) => fact && <Facts title={title} facts={[fact]} {...props} />;

const DetailFacts: React.FC<
  { details?: MovieDetails | TvDetails } & ViewProps
> = ({ details, className, ...props }) => {
  const { jellyseerrUser } = useJellyseerr();

  const locale = useMemo(() => {
    return jellyseerrUser?.settings?.locale || "en";
  }, [jellyseerrUser]);

  const region = useMemo(
    () => jellyseerrUser?.settings?.region || "US",
    [jellyseerrUser]
  );

  const releases = useMemo(
    () =>
      (details as MovieDetails)?.releases?.results.find(
        (r: TmdbRelease) => r.iso_3166_1 === region
      )?.release_dates as TmdbRelease["release_dates"],
    [details]
  );

  // Release date types:
  // 1. Premiere
  // 2. Theatrical (limited)
  // 3. Theatrical
  // 4. Digital
  // 5. Physical
  // 6. TV
  const filteredReleases = useMemo(
    () =>
      uniqBy(
        releases?.filter((r: Release) => r.type > 2 && r.type < 6),
        "type"
      ),
    [releases]
  );

  const firstAirDate = useMemo(() => {
    const firstAirDate = (details as TvDetails)?.firstAirDate;
    if (firstAirDate) {
      return new Date(firstAirDate).toLocaleDateString(
        `${locale}-${region}`,
        dateOpts
      );
    }
  }, [details]);

  const nextAirDate = useMemo(() => {
    const firstAirDate = (details as TvDetails)?.firstAirDate;
    const nextAirDate = (details as TvDetails)?.nextEpisodeToAir?.airDate;
    if (nextAirDate && firstAirDate !== nextAirDate) {
      return new Date(nextAirDate).toLocaleDateString(
        `${locale}-${region}`,
        dateOpts
      );
    }
  }, [details]);

  const revenue = useMemo(
    () =>
      (details as MovieDetails)?.revenue?.toLocaleString?.(
        `${locale}-${region}`,
        { style: "currency", currency: "USD" }
      ),
    [details]
  );

  const budget = useMemo(
    () =>
      (details as MovieDetails)?.budget?.toLocaleString?.(
        `${locale}-${region}`,
        { style: "currency", currency: "USD" }
      ),
    [details]
  );

  const streamingProviders = useMemo(
    () =>
      details?.watchProviders?.find(
        (provider) => provider.iso_3166_1 === region
      )?.flatrate,
    [details]
  );

  const networks = useMemo(() => (details as TvDetails)?.networks, [details]);

  const spokenLanguage = useMemo(
    () =>
      details?.spokenLanguages.find(
        (lng) => lng.iso_639_1 === details.originalLanguage
      )?.name,
    [details]
  );

  return (
    details && (
      <View className="p-4">
        <Text className="text-lg font-bold">Details</Text>
        <View
          className={`${className} flex flex-col justify-center divide-y-2 divide-neutral-800`}
          {...props}
        >
          <Fact title="Status" fact={details?.status} />
          <Fact
            title="Original Title"
            fact={(details as TvDetails)?.originalName}
          />
          {details.keywords.some(
            (keyword) => keyword.id === ANIME_KEYWORD_ID
          ) && <Fact title="Series Type" fact="Anime" />}
          <Facts
            title="Release Dates"
            facts={filteredReleases?.map?.((r: Release, idx) => (
              <View key={idx} className="flex flex-row space-x-2 items-center">
                {r.type === 3 ? (
                  // Theatrical
                  <Ionicons name="ticket" size={16} color="white" />
                ) : r.type === 4 ? (
                  // Digital
                  <Ionicons name="cloud" size={16} color="white" />
                ) : (
                  // Physical
                  <MaterialCommunityIcons
                    name="record-circle-outline"
                    size={16}
                    color="white"
                  />
                )}
                <Text>
                  {new Date(r.release_date).toLocaleDateString(
                    `${locale}-${region}`,
                    dateOpts
                  )}
                </Text>
              </View>
            ))}
          />
          <Fact title="First Air Date" fact={firstAirDate} />
          <Fact title="Next Air Date" fact={nextAirDate} />
          <Fact title="Revenue" fact={revenue} />
          <Fact title="Budget" fact={budget} />
          <Fact title="Original Language" fact={spokenLanguage} />
          <Facts
            title="Production Country"
            facts={details?.productionCountries?.map((n, idx) => (
              <View key={idx} className="flex flex-row items-center space-x-2">
                <CountryFlag isoCode={n.iso_3166_1} size={10} />
                <Text>{n.name}</Text>
              </View>
            ))}
          />
          <Facts
            title="Studios"
            facts={uniqBy(details?.productionCompanies, "name")?.map(
              (n) => n.name
            )}
          />
          <Facts title="Network" facts={networks?.map((n) => n.name)} />
          <Facts
            title="Currently Streaming on"
            facts={streamingProviders?.map((s) => s.name)}
          />
        </View>
      </View>
    )
  );
};

export default DetailFacts;
