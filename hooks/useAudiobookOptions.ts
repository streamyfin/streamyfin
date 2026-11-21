import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import { useActionSheet } from "@/hooks/useActionSheet";
import useRouter from "@/hooks/useAppRouter";
import { useAudiobookPlayer } from "@/providers/AudiobookPlayerProvider";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import type { Audiobook } from "@/utils/audiobooks/books";
import {
  bookDownloadStatus,
  cancelBookDownload,
  deleteBookDownload,
  downloadBook,
} from "@/utils/audiobooks/downloads";
import { logAndCaptureError } from "@/utils/log";

interface Option {
  label: string;
  run: () => void;
  destructive?: boolean;
}

/**
 * A book's menu: play, queue, finished, download, its author. Long press on a
 * book and the book page's more button open it. The download status is read
 * when the menu opens, so a list of books keeps no listener per book.
 */
export const useAudiobookOptions = (libraryId?: string) => {
  const { t } = useTranslation();
  const router = useRouter();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { showActionSheetWithOptions } = useActionSheet();
  const player = useAudiobookPlayer();

  return useCallback(
    (book: Audiobook, state: { finished?: boolean } = {}) => {
      const status = bookDownloadStatus(book);
      const author = book.authors[0];
      const options: Option[] = [
        { label: t("audiobooks.play"), run: () => player.playBook(book) },
        {
          label: t("audiobooks.play_from_start"),
          run: () => player.playBook(book, { fromStart: true }),
        },
        {
          label: t("music.track_options.play_next"),
          run: () => player.playNext(book),
        },
        {
          label: t("music.track_options.add_to_queue"),
          run: () => player.addToQueue(book),
        },
        state.finished
          ? {
              label: t("audiobooks.mark_unfinished"),
              run: () => player.markUnfinished(book),
            }
          : {
              label: t("audiobooks.mark_finished"),
              run: () => player.markFinished(book),
            },
      ];

      if (status === "downloading") {
        options.push({
          label: t("audiobooks.cancel_download"),
          run: () => cancelBookDownload(book),
        });
      } else if (status === "done" || status === "partial") {
        options.push({
          label: t("audiobooks.delete_download"),
          destructive: true,
          run: () => {
            deleteBookDownload(book).catch((error) =>
              logAndCaptureError(
                "Deleting an audiobook download failed",
                error,
              ),
            );
          },
        });
      }
      if (status !== "done" && status !== "downloading" && api && user?.Id) {
        options.push({
          label: t("audiobooks.download"),
          run: () => {
            downloadBook(api, user.Id!, book)
              .then(({ unavailable }) => {
                if (unavailable > 0) {
                  toast.error(t("audiobooks.download_unavailable"));
                }
              })
              .catch((error) =>
                logAndCaptureError(
                  "Starting an audiobook download failed",
                  error,
                ),
              );
          },
        });
      }
      if (author) {
        options.push({
          label: t("audiobooks.go_to_author"),
          run: () =>
            router.push({
              pathname: "/audiobooks/author/[author]",
              params: { author, ...(libraryId ? { libraryId } : {}) },
            }),
        });
      }

      const labels = [
        ...options.map((option) => option.label),
        t("common.cancel"),
      ];
      const destructiveIndex = options.findIndex(
        (option) => option.destructive,
      );
      showActionSheetWithOptions(
        {
          title: book.title,
          options: labels,
          cancelButtonIndex: labels.length - 1,
          destructiveButtonIndex:
            destructiveIndex >= 0 ? destructiveIndex : undefined,
        },
        (index) => {
          if (index === undefined) return;
          options[index]?.run();
        },
      );
    },
    [t, router, api, user?.Id, showActionSheetWithOptions, player, libraryId],
  );
};
