import axios from "axios";
import type {
  StreamystatsRecommendationsFullResponse,
  StreamystatsRecommendationsIdsResponse,
  StreamystatsRecommendationsParams,
  StreamystatsSearchFullResponse,
  StreamystatsSearchIdsResponse,
  StreamystatsSearchParams,
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
    serverName: string,
    type?: StreamystatsRecommendationsParams["type"],
    limit?: number,
  ): Promise<StreamystatsRecommendationsIdsResponse> => {
    return getRecommendations({
      serverName,
      format: "ids",
      type,
      limit,
      includeBasedOn: false,
      includeReasons: false,
    }) as Promise<StreamystatsRecommendationsIdsResponse>;
  };

  return {
    search,
    searchIds,
    searchFull,
    getRecommendations,
    getRecommendationIds,
  };
};

export type StreamystatsApi = ReturnType<typeof createStreamystatsApi>;
