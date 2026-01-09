import axios from "axios";
import type {
  AddWatchlistItemResponse,
  CreateWatchlistRequest,
  CreateWatchlistResponse,
  DeleteWatchlistResponse,
  GetWatchlistItemsParams,
  GetWatchlistsResponse,
  RemoveWatchlistItemResponse,
  StreamystatsRecommendationsFullResponse,
  StreamystatsRecommendationsIdsResponse,
  StreamystatsRecommendationsParams,
  StreamystatsSearchFullResponse,
  StreamystatsSearchIdsResponse,
  StreamystatsSearchParams,
  StreamystatsWatchlistDetailFullResponse,
  StreamystatsWatchlistDetailIdsResponse,
  StreamystatsWatchlistDetailParams,
  StreamystatsWatchlistsFullResponse,
  StreamystatsWatchlistsParams,
  UpdateWatchlistRequest,
  UpdateWatchlistResponse,
} from "./types";

interface StreamystatsApiConfig {
  serverUrl: string;
  jellyfinToken: string;
}

export const createStreamystatsApi = (config: StreamystatsApiConfig) => {
  const { serverUrl, jellyfinToken } = config;

  const baseUrl = serverUrl.endsWith("/") ? serverUrl.slice(0, -1) : serverUrl;

  const headers = {
    Authorization: `MediaBrowser Token="${jellyfinToken}"`,
  };

  const search = async (
    params: StreamystatsSearchParams,
  ): Promise<
    StreamystatsSearchIdsResponse | StreamystatsSearchFullResponse
  > => {
    const queryParams = new URLSearchParams();
    queryParams.set("q", params.q);

    if (params.limit) {
      queryParams.set("limit", params.limit.toString());
    }
    if (params.format) {
      queryParams.set("format", params.format);
    }
    if (params.type) {
      queryParams.set("type", params.type);
    }

    const url = `${baseUrl}/api/search?${queryParams.toString()}`;
    const response = await axios.get(url, { headers });

    return response.data;
  };

  const searchIds = async (
    query: string,
    type?: StreamystatsSearchParams["type"],
    limit?: number,
  ): Promise<StreamystatsSearchIdsResponse> => {
    return search({
      q: query,
      format: "ids",
      type,
      limit,
    }) as Promise<StreamystatsSearchIdsResponse>;
  };

  const searchFull = async (
    query: string,
    type?: StreamystatsSearchParams["type"],
    limit?: number,
  ): Promise<StreamystatsSearchFullResponse> => {
    return search({
      q: query,
      format: "full",
      type,
      limit,
    }) as Promise<StreamystatsSearchFullResponse>;
  };

  const getRecommendations = async (
    params: StreamystatsRecommendationsParams,
  ): Promise<
    | StreamystatsRecommendationsIdsResponse
    | StreamystatsRecommendationsFullResponse
  > => {
    const queryParams = new URLSearchParams();

    if (params.serverId) {
      queryParams.set("serverId", params.serverId.toString());
    }
    if (params.serverName) {
      queryParams.set("serverName", params.serverName);
    }
    if (params.jellyfinServerId) {
      queryParams.set("jellyfinServerId", params.jellyfinServerId);
    }
    if (params.limit) {
      queryParams.set("limit", params.limit.toString());
    }
    if (params.type) {
      queryParams.set("type", params.type);
    }
    if (params.range) {
      queryParams.set("range", params.range);
    }
    if (params.format) {
      queryParams.set("format", params.format);
    }
    if (params.includeBasedOn !== undefined) {
      queryParams.set("includeBasedOn", params.includeBasedOn.toString());
    }
    if (params.includeReasons !== undefined) {
      queryParams.set("includeReasons", params.includeReasons.toString());
    }

    const url = `${baseUrl}/api/recommendations?${queryParams.toString()}`;
    const response = await axios.get(url, { headers });

    return response.data;
  };

  const getRecommendationIds = async (
    jellyfinServerId: string,
    type?: StreamystatsRecommendationsParams["type"],
    limit?: number,
  ): Promise<StreamystatsRecommendationsIdsResponse> => {
    return getRecommendations({
      jellyfinServerId,
      format: "ids",
      type,
      limit,
      includeBasedOn: false,
      includeReasons: false,
    }) as Promise<StreamystatsRecommendationsIdsResponse>;
  };

  const getPromotedWatchlists = async (
    params: StreamystatsWatchlistsParams,
  ): Promise<StreamystatsWatchlistsFullResponse> => {
    const queryParams = new URLSearchParams();

    if (params.serverId) {
      queryParams.set("serverId", params.serverId.toString());
    }
    if (params.serverName) {
      queryParams.set("serverName", params.serverName);
    }
    if (params.serverUrl) {
      queryParams.set("serverUrl", params.serverUrl);
    }
    if (params.jellyfinServerId) {
      queryParams.set("jellyfinServerId", params.jellyfinServerId);
    }
    if (params.limit) {
      queryParams.set("limit", params.limit.toString());
    }
    if (params.format) {
      queryParams.set("format", params.format);
    }
    if (params.includePreview !== undefined) {
      queryParams.set("includePreview", params.includePreview.toString());
    }

    const url = `${baseUrl}/api/watchlists/promoted?${queryParams.toString()}`;
    const response = await axios.get(url, { headers });

    return response.data;
  };

  const getWatchlistItemIds = async (
    params: StreamystatsWatchlistDetailParams,
  ): Promise<StreamystatsWatchlistDetailIdsResponse> => {
    const queryParams = new URLSearchParams();
    queryParams.set("format", "ids");

    if (params.serverId) {
      queryParams.set("serverId", params.serverId.toString());
    }
    if (params.serverName) {
      queryParams.set("serverName", params.serverName);
    }
    if (params.serverUrl) {
      queryParams.set("serverUrl", params.serverUrl);
    }
    if (params.jellyfinServerId) {
      queryParams.set("jellyfinServerId", params.jellyfinServerId);
    }

    const url = `${baseUrl}/api/watchlists/${params.watchlistId}?${queryParams.toString()}`;
    const response = await axios.get(url, { headers });

    return response.data;
  };

  /**
   * Get all watchlists (own + public)
   * GET /api/watchlists
   */
  const getWatchlists = async (): Promise<GetWatchlistsResponse> => {
    const url = `${baseUrl}/api/watchlists`;
    const response = await axios.get(url, { headers });
    return response.data;
  };

  /**
   * Create a new watchlist
   * POST /api/watchlists
   */
  const createWatchlist = async (
    data: CreateWatchlistRequest,
  ): Promise<CreateWatchlistResponse> => {
    const url = `${baseUrl}/api/watchlists`;
    const response = await axios.post(url, data, { headers });
    return response.data;
  };

  /**
   * Get a single watchlist with items
   * GET /api/watchlists/[id]
   */
  const getWatchlistDetail = async (
    watchlistId: number,
    params?: GetWatchlistItemsParams,
  ): Promise<StreamystatsWatchlistDetailFullResponse> => {
    const queryParams = new URLSearchParams();
    queryParams.set("format", "full");

    if (params?.type) {
      queryParams.set("type", params.type);
    }
    if (params?.sort) {
      queryParams.set("sort", params.sort);
    }

    const url = `${baseUrl}/api/watchlists/${watchlistId}?${queryParams.toString()}`;
    const response = await axios.get(url, { headers });
    return response.data;
  };

  /**
   * Update a watchlist (owner only)
   * PATCH /api/watchlists/[id]
   */
  const updateWatchlist = async (
    watchlistId: number,
    data: UpdateWatchlistRequest,
  ): Promise<UpdateWatchlistResponse> => {
    const url = `${baseUrl}/api/watchlists/${watchlistId}`;
    const response = await axios.patch(url, data, { headers });
    return response.data;
  };

  /**
   * Delete a watchlist (owner only)
   * DELETE /api/watchlists/[id]
   */
  const deleteWatchlist = async (
    watchlistId: number,
  ): Promise<DeleteWatchlistResponse> => {
    const url = `${baseUrl}/api/watchlists/${watchlistId}`;
    const response = await axios.delete(url, { headers });
    return response.data;
  };

  /**
   * Add an item to a watchlist (owner only)
   * POST /api/watchlists/[id]/items
   */
  const addWatchlistItem = async (
    watchlistId: number,
    itemId: string,
  ): Promise<AddWatchlistItemResponse> => {
    const url = `${baseUrl}/api/watchlists/${watchlistId}/items`;
    const response = await axios.post(url, { itemId }, { headers });
    return response.data;
  };

  /**
   * Remove an item from a watchlist (owner only)
   * DELETE /api/watchlists/[id]/items/[itemId]
   */
  const removeWatchlistItem = async (
    watchlistId: number,
    itemId: string,
  ): Promise<RemoveWatchlistItemResponse> => {
    const url = `${baseUrl}/api/watchlists/${watchlistId}/items/${itemId}`;
    const response = await axios.delete(url, { headers });
    return response.data;
  };

  return {
    search,
    searchIds,
    searchFull,
    getRecommendations,
    getRecommendationIds,
    getPromotedWatchlists,
    getWatchlistItemIds,
    // Watchlist CRUD
    getWatchlists,
    createWatchlist,
    getWatchlistDetail,
    updateWatchlist,
    deleteWatchlist,
    addWatchlistItem,
    removeWatchlistItem,
  };
};

export type StreamystatsApi = ReturnType<typeof createStreamystatsApi>;
