import { Jellyfin } from "@jellyfin/sdk";
import axios from "axios";

/**
 * Creates a real SDK `Api` instance whose axios adapter returns the given
 * canned response data, so specs exercise the actual SDK request pipeline
 * without any network access.
 */
export const makeApi = (data: unknown = {}) => {
  const axiosInstance = axios.create({
    adapter: async (config) => ({
      status: 200,
      statusText: "OK",
      headers: {},
      config,
      data,
    }),
  });

  return new Jellyfin({
    clientInfo: { name: "streamyfin-tests", version: "0.0.0" },
    deviceInfo: { name: "test-device", id: "device-1" },
  }).createApi("https://jellyfin.example.com", "SECRET_TOKEN", axiosInstance);
};
