import axios from "axios";
import type {
  StreamyStatsSearchFullResponse,
  StreamyStatsSearchIdsResponse,
  StreamyStatsSearchParams,
} from "./types";

interface StreamyStatsApiConfig {
  serverUrl: string;
  jellyfinToken: string;
}

export const createStreamyStatsApi = (config: StreamyStatsApiConfig) => {
  const { serverUrl, jellyfinToken } = config;

  const baseUrl = serverUrl.endsWith("/") ? serverUrl.slice(0, -1) : serverUrl;

  const headers = {
    Authorization: `MediaBrowser Token="${jellyfinToken}"`,
  };

  const search = async (
    params: StreamyStatsSearchParams,
  ): Promise<
    StreamyStatsSearchIdsResponse | StreamyStatsSearchFullResponse
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
    type?: StreamyStatsSearchParams["type"],
    limit?: number,
  ): Promise<StreamyStatsSearchIdsResponse> => {
    return search({
      q: query,
      format: "ids",
      type,
      limit,
    }) as Promise<StreamyStatsSearchIdsResponse>;
  };

  const searchFull = async (
    query: string,
    type?: StreamyStatsSearchParams["type"],
    limit?: number,
  ): Promise<StreamyStatsSearchFullResponse> => {
    return search({
      q: query,
      format: "full",
      type,
      limit,
    }) as Promise<StreamyStatsSearchFullResponse>;
  };

  return {
    search,
    searchIds,
    searchFull,
  };
};

export type StreamyStatsApi = ReturnType<typeof createStreamyStatsApi>;
