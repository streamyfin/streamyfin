import { Colors } from "@/constants/Colors";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import type { Api } from "@jellyfin/sdk";
import type { BaseItemKind } from "@jellyfin/sdk/lib/generated-client";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { t } from "i18next";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { ScrollingCollectionList } from "./ScrollingCollectionList";

// PNG ASSET
import heart from "@/assets/icons/heart.fill.png";

type FavoriteTypes =
	| "Series"
	| "Movie"
	| "Episode"
	| "Video"
	| "BoxSet"
	| "Playlist";
type EmptyState = Record<FavoriteTypes, boolean>;

export const Favorites = () => {
	const [api] = useAtom(apiAtom);
	const [user] = useAtom(userAtom);
	const [emptyState, setEmptyState] = useState<EmptyState>({
		Series: false,
		Movie: false,
		Episode: false,
		Video: false,
		BoxSet: false,
		Playlist: false,
	});

	const fetchFavoritesByType = useCallback(
		async (itemType: BaseItemKind) => {
			const response = await getItemsApi(api as Api).getItems({
				userId: user?.Id,
				sortBy: ["SeriesSortName", "SortName"],
				sortOrder: ["Ascending"],
				filters: ["IsFavorite"],
				recursive: true,
				fields: ["PrimaryImageAspectRatio"],
				collapseBoxSetItems: false,
				excludeLocationTypes: ["Virtual"],
				enableTotalRecordCount: false,
				limit: 20,
				includeItemTypes: [itemType],
			});
			const items = response.data.Items || [];

			// Update empty state for this specific type
			setEmptyState((prev) => ({
				...prev,
				[itemType as FavoriteTypes]: items.length === 0,
			}));

			return items;
		},
		[api, user],
	);

	// Reset empty state when component mounts or dependencies change
	useEffect(() => {
		setEmptyState({
			Series: false,
			Movie: false,
			Episode: false,
			Video: false,
			BoxSet: false,
			Playlist: false,
		});
	}, [api, user]);

	// Check if all categories that have been loaded are empty
	const areAllEmpty = () => {
		const loadedCategories = Object.values(emptyState);
		return (
			loadedCategories.length > 0 &&
			loadedCategories.every((isEmpty) => isEmpty)
		);
	};

	const fetchFavoriteSeries = useCallback(
		() => fetchFavoritesByType("Series"),
		[fetchFavoritesByType],
	);
	const fetchFavoriteMovies = useCallback(
		() => fetchFavoritesByType("Movie"),
		[fetchFavoritesByType],
	);
	const fetchFavoriteEpisodes = useCallback(
		() => fetchFavoritesByType("Episode"),
		[fetchFavoritesByType],
	);
	const fetchFavoriteVideos = useCallback(
		() => fetchFavoritesByType("Video"),
		[fetchFavoritesByType],
	);
	const fetchFavoriteBoxsets = useCallback(
		() => fetchFavoritesByType("BoxSet"),
		[fetchFavoritesByType],
	);
	const fetchFavoritePlaylists = useCallback(
		() => fetchFavoritesByType("Playlist"),
		[fetchFavoritesByType],
	);

	return (
		<View className="flex flex-co gap-y-4">
			{areAllEmpty() && (
				<View className="flex-1 items-center justify-center py-12">
					<Image
						className={"w-10 h-10 mb-4"}
						style={{ tintColor: Colors.primary, resizeMode: "contain" }}
						source={heart}
					/>
					<Text className="text-xl font-semibold text-white mb-2">
						{t("favorites.noDataTitle")}
					</Text>
					<Text className="text-base text-white/70 text-center max-w-xs px-4">
						{t("favorites.noData")}
					</Text>
				</View>
			)}
			<ScrollingCollectionList
				queryFn={fetchFavoriteSeries}
				queryKey={["home", "favorites", "series"]}
				title={t("favorites.series")}
				hideIfEmpty
			/>
			<ScrollingCollectionList
				queryFn={fetchFavoriteMovies}
				queryKey={["home", "favorites", "movies"]}
				title={t("favorites.movies")}
				hideIfEmpty
				orientation="vertical"
			/>
			<ScrollingCollectionList
				queryFn={fetchFavoriteEpisodes}
				queryKey={["home", "favorites", "episodes"]}
				title={t("favorites.episodes")}
				hideIfEmpty
			/>
			<ScrollingCollectionList
				queryFn={fetchFavoriteVideos}
				queryKey={["home", "favorites", "videos"]}
				title={t("favorites.videos")}
				hideIfEmpty
			/>
			<ScrollingCollectionList
				queryFn={fetchFavoriteBoxsets}
				queryKey={["home", "favorites", "boxsets"]}
				title={t("favorites.boxsets")}
				hideIfEmpty
			/>
			<ScrollingCollectionList
				queryFn={fetchFavoritePlaylists}
				queryKey={["home", "favorites", "playlists"]}
				title={t("favorites.playlists")}
				hideIfEmpty
			/>
		</View>
	);
};
