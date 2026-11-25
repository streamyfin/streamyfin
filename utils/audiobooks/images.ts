import type { Api } from "@jellyfin/sdk";
import type { Audiobook } from "@/utils/audiobooks/books";

/** The cover of a book at a square size, null when nothing has a cover. */
export const audiobookCoverUrl = (
  api: Api | null | undefined,
  book: Pick<Audiobook, "imageItemId"> | null | undefined,
  size = 512,
): string | null =>
  api && book?.imageItemId
    ? `${api.basePath}/Items/${book.imageItemId}/Images/Primary?maxHeight=${size}&maxWidth=${size}&quality=90`
    : null;
