import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Favorites as TVFavorites } from "@/components/home/Favorites.tv";
import { TVSegmentedControl } from "@/components/tv";
import { TVStreamystatsWatchlists } from "@/components/watchlists/TVStreamystatsWatchlist";
import { TV_HORIZONTAL_PADDING } from "@/constants/Values";
import {
  useWatchlistSource,
  useWatchlistSourceOptions,
} from "@/hooks/useWatchlistSource";
import { scaleSize } from "@/utils/scaleSize";

const TV_TOP_PADDING = scaleSize(100);

interface Props {
  streamystatsShown: boolean;
  kefinShown: boolean;
}

/**
 * The Watchlists tab on TV. Its own file so the route can require it behind
 * Platform.isTV and keep the TV components out of the phone bundle.
 */
export function TVWatchlists({ streamystatsShown, kefinShown }: Props) {
  const insets = useSafeAreaInsets();
  const options = useWatchlistSourceOptions();
  const { activeSource, setSource, showToggle } = useWatchlistSource(
    streamystatsShown,
    kefinShown,
  );

  if (!streamystatsShown && !kefinShown) return null;

  if (!showToggle) {
    return activeSource === "streamystats" ? (
      <TVStreamystatsWatchlists />
    ) : (
      <TVFavorites
        filter='Likes'
        queryKeyBase='watchlist'
        emptyTitleKey='kefintweaksWatchlist.noDataTitle'
        emptyTextKey='kefintweaksWatchlist.noData'
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          paddingTop: insets.top + TV_TOP_PADDING,
          paddingHorizontal: TV_HORIZONTAL_PADDING,
        }}
      >
        <TVSegmentedControl
          options={options}
          value={activeSource}
          onChange={setSource}
          hasTVPreferredFocus
        />
      </View>
      <View style={{ flex: 1 }}>
        {activeSource === "streamystats" ? (
          <TVStreamystatsWatchlists
            isFirstSection={false}
            contentTopPadding={0}
          />
        ) : (
          <TVFavorites
            filter='Likes'
            queryKeyBase='watchlist'
            emptyTitleKey='kefintweaksWatchlist.noDataTitle'
            emptyTextKey='kefintweaksWatchlist.noData'
            isFirstSection={false}
            contentTopPadding={0}
          />
        )}
      </View>
    </View>
  );
}
