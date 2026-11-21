import type {
  BaseItemDto,
  ItemFields,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { AUDIOBOOK_LIBRARY_PAGE_SIZE } from "@/constants/Audiobooks";
import { useAudiobookPlayer } from "@/providers/AudiobookPlayerProvider";
import { useNetworkStatus } from "@/providers/NetworkStatusProvider";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import {
  type Audiobook,
  bookContainingItem,
  groupAudiobooks,
  libraryRootIds,
  slimBook,
} from "@/utils/audiobooks/books";
import {
  bookProgress,
  type ResumePoint,
  resolveResumePoint,
} from "@/utils/audiobooks/progress";
import {
  accountKeyFor,
  getDownloadedBook,
  getDownloadedBooks,
  getLocalProgress,
} from "@/utils/audiobooks/storage";

/** The list fields: enough to group files into books and show them. */
const LIST_FIELDS: ItemFields[] = [
  "ParentId",
  "SortName",
  "DateCreated",
  "Genres",
];

/** The detail fields: chapters, people and the description too. */
const DETAIL_FIELDS: ItemFields[] = [
  ...LIST_FIELDS,
  "Chapters",
  "People",
  "Overview",
];

/**
 * Every book in a books library. The library is read whole: its files have to
 * be grouped into books (utils/audiobooks/books.ts) before anything can be
 * listed or counted. Offline it answers with the downloaded books.
 */
export const useAudiobookLibrary = (libraryId: string | undefined) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { isConnected, serverConnected } = useNetworkStatus();
  const isOffline = !isConnected || serverConnected === false;

  const query = useQuery({
    queryKey: ["audiobooks", "library", libraryId, user?.Id],
    queryFn: async (): Promise<Audiobook[]> => {
      const items: BaseItemDto[] = [];
      for (let startIndex = 0; ; startIndex += AUDIOBOOK_LIBRARY_PAGE_SIZE) {
        const response = await getLibraryApi(api!).getItems({
          userId: user!.Id!,
          parentId: libraryId,
          recursive: true,
          includeItemTypes: ["AudioBook", "Folder"],
          fields: [...LIST_FIELDS],
          enableImageTypes: ["Primary"],
          imageTypeLimit: 1,
          sortBy: ["SortName"],
          startIndex,
          limit: AUDIOBOOK_LIBRARY_PAGE_SIZE,
          enableTotalRecordCount: true,
        });
        const page = response.data.Items ?? [];
        items.push(...page);
        const total = response.data.TotalRecordCount ?? 0;
        if (page.length === 0 || startIndex + page.length >= total) break;
      }
      const folders = items.filter((item) => item.Type === "Folder");
      const files = items.filter((item) => item.Type === "AudioBook");
      return groupAudiobooks(
        files,
        folders,
        libraryRootIds(libraryId, folders),
      ).map(slimBook);
    },
    enabled: !!api && !!user?.Id && !!libraryId && !isOffline,
    staleTime: 5 * 60_000,
  });

  const downloaded = useMemo(
    () =>
      isOffline
        ? getDownloadedBooks(user?.ServerId).map((entry) => entry.book)
        : [],
    [isOffline, user?.ServerId],
  );

  return {
    ...query,
    books: isOffline ? downloaded : (query.data ?? []),
    isOffline,
  };
};

/**
 * One book, from the id of any of its files: the file, the files beside it
 * and the folder they are in, with chapters and people. Offline, or when the
 * server cannot be reached, the downloaded copy answers.
 */
export const useAudiobook = (itemId: string | undefined) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { isConnected, serverConnected } = useNetworkStatus();
  const isOffline = !isConnected || serverConnected === false;
  const downloaded = itemId ? getDownloadedBook(itemId)?.book : undefined;

  const query = useQuery({
    queryKey: ["audiobooks", "book", itemId, user?.Id],
    queryFn: async (): Promise<{
      book: Audiobook;
      libraryId: string | null;
    }> => {
      const libraryApi = getLibraryApi(api!);
      const userId = user!.Id!;
      const [{ data: item }, { data: ancestors }] = await Promise.all([
        libraryApi.getItem({ itemId: itemId!, userId }),
        libraryApi.getAncestors({ itemId: itemId!, userId }),
      ]);
      // Closest first. A file in a library's root has the library itself as
      // its first ancestor: that root is a shelf, not a book.
      const parent = ancestors[0];
      const parentIsRoot =
        !parent || parent.Type === "CollectionFolder" || !item.ParentId;
      const loneFile = parentIsRoot && !item.Album;

      const [siblings, folder] = loneFile
        ? [[item], null]
        : await Promise.all([
            libraryApi
              .getItems({
                userId,
                parentId: item.ParentId!,
                includeItemTypes: ["AudioBook"],
                fields: [...DETAIL_FIELDS],
                enableImageTypes: ["Primary"],
                imageTypeLimit: 1,
              })
              .then((response) => response.data.Items ?? []),
            parentIsRoot
              ? Promise.resolve(null)
              : libraryApi
                  .getItem({ itemId: item.ParentId!, userId })
                  .then((response) => response.data),
          ]);
      // The file itself carries the full fields; the folder listing may not.
      const withDetail = siblings.map((sibling) =>
        sibling.Id === item.Id ? { ...sibling, ...item } : sibling,
      );
      return {
        book: bookContainingItem(item, withDetail, folder, parentIsRoot),
        libraryId:
          ancestors.find((ancestor) => ancestor.Type === "CollectionFolder")
            ?.Id ?? null,
      };
    },
    enabled: !!api && !!user?.Id && !!itemId && !isOffline,
    staleTime: 60_000,
  });

  return {
    ...query,
    book: query.data?.book ?? downloaded ?? null,
    libraryId: query.data?.libraryId ?? null,
    isOffline,
  };
};

/**
 * Where each book stands: the newer of the server's position and this
 * device's. Recomputed when the player saved progress.
 */
export const useAudiobookProgressMap = (books: Audiobook[]) => {
  const user = useAtomValue(userAtom);
  const { progressRevision } = useAudiobookPlayer();
  const account = accountKeyFor(user);

  return useMemo(() => {
    const map = new Map<
      string,
      {
        point: ResumePoint;
        listened: number;
        duration: number;
        fraction: number;
      }
    >();
    for (const book of books) {
      const point = resolveResumePoint(
        book,
        getLocalProgress(account, book.id),
      );
      map.set(book.id, { point, ...bookProgress(book, point) });
    }
    return map;
  }, [books, account, progressRevision]);
};
