import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { toast } from "sonner-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { createStreamystatsApi } from "@/utils/streamystats/api";
import type {
  CreateWatchlistRequest,
  StreamystatsWatchlist,
  UpdateWatchlistRequest,
} from "@/utils/streamystats/types";

/**
 * Hook to create a new watchlist
 */
export const useCreateWatchlist = () => {
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (
      data: CreateWatchlistRequest,
    ): Promise<StreamystatsWatchlist> => {
      if (!settings?.streamyStatsServerUrl || !api?.accessToken) {
        throw new Error("Streamystats not configured");
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
      toast.success("Watchlist created");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create watchlist");
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
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({
      watchlistId,
      data,
    }: {
      watchlistId: number;
      data: UpdateWatchlistRequest;
    }): Promise<StreamystatsWatchlist> => {
      if (!settings?.streamyStatsServerUrl || !api?.accessToken) {
        throw new Error("Streamystats not configured");
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
      toast.success("Watchlist updated");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update watchlist");
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
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (watchlistId: number): Promise<void> => {
      if (!settings?.streamyStatsServerUrl || !api?.accessToken) {
        throw new Error("Streamystats not configured");
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
      toast.success("Watchlist deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to delete watchlist");
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
  const queryClient = useQueryClient();

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
        throw new Error("Streamystats not configured");
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
        queryKey: ["streamystats", "watchlist", variables.watchlistId],
      });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "watchlistItems", variables.watchlistId],
      });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "itemInWatchlists", variables.itemId],
      });
      if (variables.watchlistName) {
        toast.success(`Added to ${variables.watchlistName}`);
      } else {
        toast.success("Added to watchlist");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add to watchlist");
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
  const queryClient = useQueryClient();

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
        throw new Error("Streamystats not configured");
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
        queryKey: ["streamystats", "watchlist", variables.watchlistId],
      });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "watchlistItems", variables.watchlistId],
      });
      queryClient.invalidateQueries({
        queryKey: ["streamystats", "itemInWatchlists", variables.itemId],
      });
      if (variables.watchlistName) {
        toast.success(`Removed from ${variables.watchlistName}`);
      } else {
        toast.success("Removed from watchlist");
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to remove from watchlist");
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
