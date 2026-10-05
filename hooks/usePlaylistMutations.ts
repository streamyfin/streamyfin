import { getLibraryApi, getPlaylistsApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

/**
 * Hook to create a new playlist
 */
export const useCreatePlaylist = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const queryClient = useNetworkAwareQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: async ({
      name,
      trackIds,
    }: {
      name: string;
      trackIds?: string[];
    }): Promise<string | undefined> => {
      if (!api || !user?.Id) {
        throw new Error("API not configured");
      }

      const response = await getPlaylistsApi(api).createPlaylist({
        createPlaylistDto: {
          Name: name,
          Ids: trackIds,
          UserId: user.Id,
          MediaType: "Audio",
        },
      });

      return response.data.Id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["music-playlists"],
        refetchType: "all",
      });
      toast.success(t("music.playlists.created"));
    },
    onError: (error: Error) => {
      toast.error(error.message || t("music.playlists.failed_to_create"));
    },
  });

  return mutation;
};

/**
 * Hook to add a track to a playlist.
 *
 * `position` is the 0-based index the tracks go in at, 0 for the top. Leave it
 * out and they are appended. It needs Jellyfin 12: an older server ignores it
 * and appends, so a control that offers it checks
 * `supportsPlaylistInsertPosition` first.
 */
export const useAddToPlaylist = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const queryClient = useNetworkAwareQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: async ({
      playlistId,
      trackIds,
      position,
    }: {
      playlistId: string;
      trackIds: string[];
      playlistName?: string;
      position?: number;
    }): Promise<void> => {
      if (!api || !user?.Id) {
        throw new Error("API not configured");
      }

      await getPlaylistsApi(api).addItemToPlaylist(
        {
          playlistId,
          ids: trackIds,
          userId: user.Id,
        },
        // The 0.13 SDK predates the parameter, so it rides along as a plain
        // query parameter next to the ones the SDK writes.
        position === undefined ? undefined : { params: { position } },
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["music-playlists"],
      });
      queryClient.invalidateQueries({
        queryKey: ["music-playlist", variables.playlistId],
      });
      if (variables.playlistName) {
        toast.success(
          t("music.playlists.added_to", { name: variables.playlistName }),
        );
      } else {
        toast.success(t("music.playlists.added"));
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || t("music.playlists.failed_to_add"));
    },
  });

  return mutation;
};

/**
 * Hook to remove a track from a playlist
 */
export const useRemoveFromPlaylist = () => {
  const api = useAtomValue(apiAtom);
  const queryClient = useNetworkAwareQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: async ({
      playlistId,
      entryIds,
    }: {
      playlistId: string;
      entryIds: string[];
      playlistName?: string;
    }): Promise<void> => {
      if (!api) {
        throw new Error("API not configured");
      }

      await getPlaylistsApi(api).removeItemFromPlaylist({
        playlistId,
        entryIds,
      });
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["music-playlists"],
      });
      queryClient.invalidateQueries({
        queryKey: ["music-playlist", variables.playlistId],
      });
      queryClient.invalidateQueries({
        queryKey: ["music-playlist-tracks", variables.playlistId],
      });
      if (variables.playlistName) {
        toast.success(
          t("music.playlists.removed_from", { name: variables.playlistName }),
        );
      } else {
        toast.success(t("music.playlists.removed"));
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || t("music.playlists.failed_to_remove"));
    },
  });

  return mutation;
};

/**
 * Hook to delete a playlist
 */
export const useDeletePlaylist = () => {
  const api = useAtomValue(apiAtom);
  const queryClient = useNetworkAwareQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: async ({
      playlistId,
    }: {
      playlistId: string;
    }): Promise<void> => {
      if (!api) {
        throw new Error("API not configured");
      }

      await getLibraryApi(api).deleteItem({
        itemId: playlistId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["music-playlists"],
        refetchType: "all",
      });
      toast.success(t("music.playlists.deleted"));
    },
    onError: (error: Error) => {
      toast.error(error.message || t("music.playlists.failed_to_delete"));
    },
  });

  return mutation;
};
