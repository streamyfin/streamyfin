import { useHeaderHeight } from "expo-router/react-navigation";
import { type RefObject, useEffect, useRef } from "react";
import { Platform } from "react-native";

type ScrollableList = {
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
};

type Options = {
  /** The list goes back to its top whenever this changes. */
  resetKey: string;
  isFetching: boolean;
  /** What the list shows, so the re-pin waits for the new result. */
  data: unknown;
};

/**
 * Scrolls a list on a screen with a transparent iOS header back to its top
 * when `resetKey` changes, instead of leaving it deep in the previous result.
 */
export const usePinListToTop = (
  listRef: RefObject<ScrollableList | null>,
  { resetKey, isFetching, data }: Options,
) => {
  const pendingScrollTopRef = useRef(false);

  // Where the top of the list is. The iOS header is transparent and the list
  // runs under it, inset by the header's height, so its top sits at minus that
  // height: offset 0 would leave the list's own header behind the bar.
  const headerHeight = useHeaderHeight();
  const topOffset = Platform.OS === "ios" ? -headerHeight : 0;

  // Instant feedback: pin to the top as soon as the key changes, without
  // waiting for the new fetch, and flag a re-pin for once it settles.
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: topOffset, animated: false });
    pendingScrollTopRef.current = true;
  }, [resetKey, topOffset, listRef]);

  // Safety net: FlashList can restore the previous offset as the new list
  // grows, so re-pin once the fetch settles. Pagination keeps the same key,
  // so it never re-pins.
  useEffect(() => {
    if (pendingScrollTopRef.current && !isFetching) {
      pendingScrollTopRef.current = false;
      listRef.current?.scrollToOffset({ offset: topOffset, animated: false });
    }
  }, [isFetching, data, topOffset, listRef]);
};
