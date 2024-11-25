import { useQueryClient } from "@tanstack/react-query";

/**
 * useRevalidatePlaybackProgressCache invalidates queries related to playback progress.
 */
export function useRevalidatePlaybackProgressCache() {
  const queryClient = useQueryClient();

  const revalidate = () => {
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
    queriesToInvalidate.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey });
    });
  };

  return revalidate;
}
