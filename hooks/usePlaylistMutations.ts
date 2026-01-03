import { getPlaylistsApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

/**
 * Hook to create a new playlist
 */
export const useCreatePlaylist = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const queryClient = useQueryClient();
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
        name,
        ids: trackIds,
        userId: user.Id,
        mediaType: "Audio",
      });

      return response.data.Id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["music-playlists"],
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
 * Hook to add a track to a playlist
 */
export const useAddToPlaylist = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const mutation = useMutation({
    mutationFn: async ({
      playlistId,
      trackIds,
    }: {
      playlistId: string;
      trackIds: string[];
      playlistName?: string;
    }): Promise<void> => {
      if (!api || !user?.Id) {
        throw new Error("API not configured");
      }

      await getPlaylistsApi(api).addItemToPlaylist({
        playlistId,
        ids: trackIds,
        userId: user.Id,
      });
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
  const queryClient = useQueryClient();
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
