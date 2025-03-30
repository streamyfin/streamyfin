import { itemRouter } from "@/components/common/TouchableItemRouter";
import { DownloadedItem } from "@/providers/DownloadProvider";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import axios from "axios";
import { MMKV } from "react-native-mmkv";
import { writeToLog } from "./log";

interface IJobInput {
  deviceId?: string | null;
  authHeader?: string | null;
  url?: string | null;
}

export interface JobStatus {
  id: string;
  status:
    | "queued"
    | "optimizing"
    | "completed"
    | "failed"
    | "cancelled"
    | "downloading";
  progress: number;
  outputPath: string;
  inputUrl: string;
  deviceId: string;
  itemId: string;
  item: BaseItemDto;
  speed?: number;
  timestamp: Date;
  base64Image?: string;
}

/**
 * Fetches all jobs for a specific device.
 *
 * @param {IGetAllDeviceJobs} params - The parameters for the API request.
 * @param {string} params.deviceId - The ID of the device to fetch jobs for.
 * @param {string} params.authHeader - The authorization header for the API request.
 * @param {string} params.url - The base URL for the API endpoint.
 *
 * @returns {Promise<JobStatus[]>} A promise that resolves to an array of job statuses.
 *
 * @throws {Error} Throws an error if the API request fails or returns a non-200 status code.
 */
export async function getAllJobsByDeviceId({
  deviceId,
  authHeader,
  url,
}: IJobInput): Promise<JobStatus[]> {
  const statusResponse = await axios.get(`${url}all-jobs`, {
    headers: {
      Authorization: authHeader,
    },
    params: {
      deviceId,
    },
  });
  if (statusResponse.status !== 200) {
    console.error(
      statusResponse.status,
      statusResponse.data,
      statusResponse.statusText,
    );
    throw new Error("Failed to fetch job status");
  }

  return statusResponse.data;
}

interface ICancelJob {
  authHeader: string;
  url: string;
  id: string;
}

export async function cancelJobById({
  authHeader,
  url,
  id,
}: ICancelJob): Promise<boolean> {
  const statusResponse = await axios.delete(`${url}cancel-job/${id}`, {
    headers: {
      Authorization: authHeader,
    },
  });
  if (statusResponse.status !== 200) {
    throw new Error("Failed to cancel process");
  }

  return true;
}

export async function cancelAllJobs({ authHeader, url, deviceId }: IJobInput) {
  if (!deviceId) return false;
  if (!authHeader) return false;
  if (!url) return false;

  try {
    await getAllJobsByDeviceId({
      deviceId,
      authHeader,
      url,
    }).then((jobs) => {
      for (const job of jobs) {
        cancelJobById({
          authHeader,
          url,
          id: job.id,
        });
      }
    });
  } catch (error) {
    writeToLog("ERROR", "Failed to cancel all jobs", error);
    console.error(error);
    return false;
  }

  return true;
}

/**
 * Fetches statistics for a specific device.
 *
 * @param {IJobInput} params - The parameters for the API request.
 * @param {string} params.deviceId - The ID of the device to fetch statistics for.
 * @param {string} params.authHeader - The authorization header for the API request.
 * @param {string} params.url - The base URL for the API endpoint.
 *
 * @returns {Promise<any | null>} A promise that resolves to the statistics data or null if the request fails.
 *
 * @throws {Error} Throws an error if any required parameter is missing.
 */
export async function getStatistics({
  authHeader,
  url,
  deviceId,
}: IJobInput): Promise<any | null> {
  if (!deviceId || !authHeader || !url) {
    return null;
  }

  try {
    const statusResponse = await axios.get(`${url}statistics`, {
      headers: {
        Authorization: authHeader,
      },
      params: {
        deviceId,
      },
    });

    return statusResponse.data;
  } catch (error) {
    console.error("Failed to fetch statistics:", error);
    return null;
  }
}

/**
 * Saves the download item info to disk - this data is used temporarily to fetch additional download information
 * in combination with the optimize server. This is used to not have to send all item info to the optimize server.
 *
 * @param {BaseItemDto} item - The item to save.
 * @param {MediaSourceInfo} mediaSource - The media source of the item.
 * @param {string} url - The URL of the item.
 * @return {boolean} A promise that resolves when the item info is saved.
 */
export function saveDownloadItemInfoToDiskTmp(
  item: BaseItemDto,
  mediaSource: MediaSourceInfo,
  url: string,
): boolean {
  try {
    const storage = new MMKV();

    const downloadInfo = JSON.stringify({
      item,
      mediaSource,
      url,
    });

    storage.set(`tmp_download_info_${item.Id}`, downloadInfo);

    return true;
  } catch (error) {
    console.error("Failed to save download item info to disk:", error);
    throw error;
  }
}

/**
 * Retrieves the download item info from disk.
 *
 * @param {string} itemId - The ID of the item to retrieve.
 * @return {{
 *  item: BaseItemDto;
 *  mediaSource: MediaSourceInfo;
 *  url: string;
 * } | null} The retrieved download item info or null if not found.
 */
export function getDownloadItemInfoFromDiskTmp(itemId: string): {
  item: BaseItemDto;
  mediaSource: MediaSourceInfo;
  url: string;
} | null {
  try {
    const storage = new MMKV();
    const rawInfo = storage.getString(`tmp_download_info_${itemId}`);

    if (rawInfo) {
      return JSON.parse(rawInfo);
    }
    return null;
  } catch (error) {
    console.error("Failed to retrieve download item info from disk:", error);
    return null;
  }
}

/**
 * Deletes the download item info from disk.
 *
 * @param {string} itemId - The ID of the item to delete.
 * @return {boolean} True if the item info was successfully deleted, false otherwise.
 */
export function deleteDownloadItemInfoFromDiskTmp(itemId: string): boolean {
  try {
    const storage = new MMKV();
    storage.delete(`tmp_download_info_${itemId}`);
    return true;
  } catch (error) {
    console.error("Failed to delete download item info from disk:", error);
    return false;
  }
}
