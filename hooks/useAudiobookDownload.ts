import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { audioStorageEvents } from "@/providers/AudioStorage";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import type { Audiobook } from "@/utils/audiobooks/books";
import {
  type BookDownloadResult,
  bookDownloadProgress,
  bookDownloadStatus,
  deleteBookDownload,
  downloadBook,
} from "@/utils/audiobooks/downloads";
import { logAndCaptureError } from "@/utils/log";

/**
 * A book's download: whether it is on the device, how far a download got,
 * and the actions. Follows the audio storage's events for the book's parts.
 */
export const useAudiobookDownload = (book: Audiobook | null | undefined) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  // Bumped by every storage event for one of the parts: the status is read
  // from the storage index, which is not React state.
  const [revision, setRevision] = useState(0);
  const [partProgress, setPartProgress] = useState<Record<string, number>>({});
  const [isStarting, setIsStarting] = useState(false);

  const partIds = useMemo(
    () => new Set((book?.parts ?? []).map((part) => part.Id).filter(Boolean)),
    [book],
  );

  useEffect(() => {
    if (partIds.size === 0) return;
    const onProgress = ({
      itemId,
      progress,
    }: {
      itemId: string;
      progress: number;
    }) => {
      if (!partIds.has(itemId)) return;
      setPartProgress((previous) => ({ ...previous, [itemId]: progress }));
    };
    const onSettled = ({ itemId }: { itemId: string }) => {
      if (!partIds.has(itemId)) return;
      setRevision((value) => value + 1);
    };
    audioStorageEvents.on("progress", onProgress);
    audioStorageEvents.on("complete", onSettled);
    audioStorageEvents.on("error", onSettled);
    return () => {
      audioStorageEvents.off("progress", onProgress);
      audioStorageEvents.off("complete", onSettled);
      audioStorageEvents.off("error", onSettled);
    };
  }, [partIds]);

  const status = useMemo(
    () => (book ? bookDownloadStatus(book) : "none"),
    [book, revision],
  );

  const progress = useMemo(
    () => (book ? bookDownloadProgress(book, partProgress) : 0),
    [book, partProgress, revision],
  );

  const download = useCallback(async (): Promise<BookDownloadResult | null> => {
    if (!book || !api || !user?.Id) return null;
    setIsStarting(true);
    try {
      return await downloadBook(api, user.Id, book);
    } catch (error) {
      // The button stops spinning and nothing is stored when this fails.
      logAndCaptureError("Starting an audiobook download failed", error);
      return null;
    } finally {
      setIsStarting(false);
      setRevision((value) => value + 1);
    }
  }, [api, user?.Id, book]);

  const remove = useCallback(async () => {
    if (!book) return;
    await deleteBookDownload(book);
    setPartProgress({});
    setRevision((value) => value + 1);
  }, [book]);

  return {
    status: isStarting && status === "none" ? "downloading" : status,
    progress,
    download,
    remove,
  } as const;
};
