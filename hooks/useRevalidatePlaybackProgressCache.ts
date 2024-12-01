import { useQueryClient } from "@tanstack/react-query";

/**
 * useRevalidatePlaybackProgressCache invalidates queries related to playback progress.
 */
export function useInvalidatePlaybackProgressCache() {
  const queryClient = useQueryClient();

  const revalidate = async () => {
    // List of all the queries to invalidate
    const queriesToInvalidate = [
      ["item"],
      ["resumeItems"],
      ["continueWatching"],
      ["nextUp-all"],
      ["nextUp"],
      ["episodes"],
      ["seasons"],
      ["home"],
    ];

    // Invalidate each query
    for (const queryKey of queriesToInvalidate) {
      await queryClient.invalidateQueries({ queryKey });
    }
  };

  return revalidate;
}
