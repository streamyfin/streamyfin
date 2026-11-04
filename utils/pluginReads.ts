import { onlineManager } from "@tanstack/react-query";
import { PLUGIN_READ_RETRIES } from "@/constants/Notifications";
import { markExpectedError } from "@/utils/errors";

/** The HTTP status a request failed with, when the server answered. */
export const statusOf = (error: unknown): number | undefined =>
  (error as { response?: { status?: number } })?.response?.status;

/** A plugin without the route answers 404, which only means it is not offered. */
export const isNotFound = (error: unknown): boolean => statusOf(error) === 404;

/**
 * Reads one of the plugin's routes for the person. The 404 of a plugin without it is marked
 * expected: it hides what the route serves, and is no defect to report.
 */
export const readPluginRoute = async <T>(
  read: () => Promise<T>,
): Promise<T> => {
  try {
    return await read();
  } catch (error) {
    throw isNotFound(error) ? markExpectedError(error) : error;
  }
};

/**
 * Whether to read a plugin route again: not for a missing route, and not offline, where a
 * retry waits for the network and leaves the screen blank meanwhile.
 */
export const retryPluginRead = (count: number, error: unknown): boolean =>
  onlineManager.isOnline() && !isNotFound(error) && count < PLUGIN_READ_RETRIES;
