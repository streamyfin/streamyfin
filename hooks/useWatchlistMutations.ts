import { useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { t } from "i18next";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { toast } from "sonner-native";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { createStreamystatsApi } from "@/utils/streamystats/api";
import type {
  CreateWatchlistRequest,
  StreamystatsWatchlist,
  UpdateWatchlistRequest,
} from "@/utils/streamystats/types";

/**
 * What a failed call says to the user: the server's own message when it sent
 * one, else `fallback`, in the app's language. Axios rejects an HTTP error
 * with an English message of its own, which is not the server's.
 */
const errorMessage = (error: Error, fallback: string): string => {
  if (isAxiosError(error)) {
    const sent = (error.response?.data as { error?: unknown } | undefined)
      ?.error;
    return typeof sent === "string" && sent ? sent : fallback;
  }
  return error.message || fallback;
};

/**
 * Hook to create a new watchlist
 */
export const useCreateWatchlist = () => {
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();
  const queryClient = useNetworkAwareQueryClient();

  const mutation = useMutation({
    mutationFn: async (
      data: CreateWatchlistRequest,
    ): Promise<StreamystatsWatchlist> => {
      if (!settings?.streamyStatsServerUrl || !api?.accessToken) {
        throw new Error(t("watchlists.not_configured_title"));
      }

      const streamystatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      const response = await streamystatsApi.createWatchlist(data);
      if (response.error) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "watchlists"],
      });
      toast.success(t("watchlists.toasts.created"));
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error, t("watchlists.toasts.create_failed")));
    },
  });

  return mutation;
};

/**
 * Hook to update a watchlist
 */
export const useUpdateWatchlist = () => {
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();
  const queryClient = useNetworkAwareQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      watchlistId,
      data,
    }: {
      watchlistId: number;
      data: UpdateWatchlistRequest;
    }): Promise<StreamystatsWatchlist> => {
      if (!settings?.streamyStatsServerUrl || !api?.accessToken) {
        throw new Error(t("watchlists.not_configured_title"));
      }

      const streamystatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      const response = await streamystatsApi.updateWatchlist(watchlistId, data);
      if (response.error) {
        throw new Error(response.error);
      }
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "watchlists"],
      });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "watchlist", variables.watchlistId],
      });
      toast.success(t("watchlists.toasts.updated"));
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error, t("watchlists.toasts.update_failed")));
    },
  });

  return mutation;
};

/**
 * Hook to delete a watchlist
 */
export const useDeleteWatchlist = () => {
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();
  const queryClient = useNetworkAwareQueryClient();

  const mutation = useMutation({
    mutationFn: async (watchlistId: number): Promise<void> => {
      if (!settings?.streamyStatsServerUrl || !api?.accessToken) {
        throw new Error(t("watchlists.not_configured_title"));
      }

      const streamystatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      const response = await streamystatsApi.deleteWatchlist(watchlistId);
      if (response.error) {
        throw new Error(response.error);
      }
    },
    onSuccess: (_data, watchlistId) => {
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "watchlists"],
      });
      queryClient.removeQueries({
        queryKey: ["streamystats", "watchlist", watchlistId],
      });
      toast.success(t("watchlists.toasts.deleted"));
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error, t("watchlists.toasts.delete_failed")));
    },
  });

  return mutation;
};

/**
 * Hook to add an item to a watchlist with optimistic update
 */
export const useAddToWatchlist = () => {
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();
  const queryClient = useNetworkAwareQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      watchlistId,
      itemId,
    }: {
      watchlistId: number;
      itemId: string;
      watchlistName?: string;
    }): Promise<void> => {
      if (!settings?.streamyStatsServerUrl || !api?.accessToken) {
        throw new Error(t("watchlists.not_configured_title"));
      }

      const streamystatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      const response = await streamystatsApi.addWatchlistItem(
        watchlistId,
        itemId,
      );
      if (response.error) {
        throw new Error(response.error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "watchlists"],
      });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "watchlist", variables.watchlistId],
      });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "watchlistItems", variables.watchlistId],
      });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "itemInWatchlists", variables.itemId],
      });
      if (variables.watchlistName) {
        toast.success(
          t("watchlists.toasts.added_to", { name: variables.watchlistName }),
        );
      } else {
        toast.success(t("watchlists.toasts.added"));
      }
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error, t("watchlists.toasts.add_failed")));
    },
  });

  return mutation;
};

/**
 * Hook to remove an item from a watchlist with optimistic update
 */
export const useRemoveFromWatchlist = () => {
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();
  const queryClient = useNetworkAwareQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      watchlistId,
      itemId,
    }: {
      watchlistId: number;
      itemId: string;
      watchlistName?: string;
    }): Promise<void> => {
      if (!settings?.streamyStatsServerUrl || !api?.accessToken) {
        throw new Error(t("watchlists.not_configured_title"));
      }

      const streamystatsApi = createStreamystatsApi({
        serverUrl: settings.streamyStatsServerUrl,
        jellyfinToken: api.accessToken,
      });

      const response = await streamystatsApi.removeWatchlistItem(
        watchlistId,
        itemId,
      );
      if (response.error) {
        throw new Error(response.error);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "watchlists"],
      });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "watchlist", variables.watchlistId],
      });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "watchlistItems", variables.watchlistId],
      });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "itemInWatchlists", variables.itemId],
      });
      if (variables.watchlistName) {
        toast.success(
          t("watchlists.toasts.removed_from", {
            name: variables.watchlistName,
          }),
        );
      } else {
        toast.success(t("watchlists.toasts.removed"));
      }
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error, t("watchlists.toasts.remove_failed")));
    },
  });

  return mutation;
};

/**
 * Hook to toggle an item in a watchlist
 */
export const useToggleWatchlistItem = () => {
  const addMutation = useAddToWatchlist();
  const removeMutation = useRemoveFromWatchlist();

  const toggle = useCallback(
    async (params: {
      watchlistId: number;
      itemId: string;
      isInWatchlist: boolean;
      watchlistName?: string;
    }) => {
      if (params.isInWatchlist) {
        await removeMutation.mutateAsync({
          watchlistId: params.watchlistId,
          itemId: params.itemId,
          watchlistName: params.watchlistName,
        });
      } else {
        await addMutation.mutateAsync({
          watchlistId: params.watchlistId,
          itemId: params.itemId,
          watchlistName: params.watchlistName,
        });
      }
    },
    [addMutation, removeMutation],
  );

  return {
    toggle,
    isLoading: addMutation.isPending || removeMutation.isPending,
  };
};
