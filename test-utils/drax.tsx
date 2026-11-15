import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { ViewProps } from "react-native";
import { View } from "react-native";

type SortableOptions = {
  data: unknown[];
  keyExtractor: (item: never, index: number) => string;
  onReorder: (event: {
    fromIndex: number;
    toIndex: number;
    data: unknown[];
  }) => void;
  onDragStart?: (event: unknown) => void;
  onDragEnd?: (event: unknown) => void;
};

type ItemProps = {
  index: number;
  onDragEnd?: (event: unknown) => void;
  onDragDrop?: (event: unknown) => void;
};

type SortableState = {
  options: SortableOptions;
  /** What the list renders, in drax's `stableData` order. */
  stableData: unknown[];
  /** Slots of `stableData` in the order shown after the last drop. */
  committedOrder: number[];
  committedKeys: string[];
  /** The props each sortable item was last given, by slot. */
  items: Map<number, ItemProps>;
};

let lastList: SortableState | undefined;
let resets = 0;
const root = {
  page: { x: 0, y: 0 },
  offset: { value: { x: 0, y: 0 } },
};

const currentList = () => {
  if (!lastList) throw new Error("No sortable list on screen");
  return lastList;
};

const keyOf = (list: SortableState, slot: number) =>
  list.options.keyExtractor(list.stableData[slot] as never, slot);

const shownOrder = (list: SortableState) =>
  list.committedOrder.length > 0
    ? [...list.committedOrder]
    : list.stableData.map((_, slot) => slot);

/**
 * Stands for `react-native-drax` in specs. A drag needs gestures and layout
 * Jest does not have, so the double keeps what a spec can observe of drax
 * 1.1.0: rows render from `stableData`, which a drop does not change while
 * the parent's new data matches the dropped order by key (drax moves the rows
 * with transforms instead, `shownItems` reads that order back); a release
 * ends the drag at once, the reorder comes a frame later. Each sortable item
 * keeps the props it was given (`draxItemProps`).
 */
export const draxModule = {
  DraxProvider: ({ children }: { children?: React.ReactNode }) => children,
  SortableContainer: ({ children }: { children?: React.ReactNode }) => children,
  DraxHandle: ({ children }: { children?: React.ReactNode }) => (
    <View testID='drax-handle'>{children}</View>
  ),
  SortableItem: ({
    children,
    sortable: _sortable,
    ...props
  }: ItemProps & {
    children?: React.ReactNode;
    sortable: unknown;
  }) => {
    lastList?.items.set(props.index, props);
    return (
      <View {...({ testID: "drax-item", draxItemProps: props } as ViewProps)}>
        {children}
      </View>
    );
  },
  useDraxContext: () => ({
    rootViewRef: {
      current: {
        measure: (
          callback: (
            ...args: [number, number, number, number, number, number]
          ) => void,
        ) => callback(0, 0, 0, 0, root.page.x, root.page.y),
      },
    },
    rootOffsetSV: root.offset,
  }),
  useSortableList: (options: SortableOptions) => {
    const [stableData, setStableData] = useState(options.data);
    const state = useRef<SortableState>({
      options,
      stableData,
      committedOrder: [],
      committedKeys: [],
      items: new Map(),
    }).current;
    state.options = options;
    state.stableData = stableData;
    lastList = state;

    // As drax: new data whose keys match the dropped order keeps the rows
    // where they are; anything else resets them, and a reset during a drag
    // drops the shifts the drag has made so far.
    useLayoutEffect(() => {
      const committed = state.committedKeys;
      if (
        committed.length > 0 &&
        committed.length === options.data.length &&
        options.data.every(
          (item, index) =>
            options.keyExtractor(item as never, index) === committed[index],
        )
      )
        return;
      resets += 1;
      state.committedOrder = [];
      state.committedKeys = [];
      setStableData(options.data);
    }, [options.data, options.keyExtractor, state]);

    return {
      data: stableData,
      onScroll: () => {},
      onContentSizeChange: () => {},
      stableKeyExtractor: (_item: unknown, index: number) => `__drax_${index}`,
      _internal: {},
    };
  },
};

const drag = (fromIndex: number) => {
  const list = currentList();
  const order = shownOrder(list);
  const slot = order[fromIndex];
  list.options.onDragStart?.({
    index: fromIndex,
    item: list.stableData[slot],
  });
  return { list, order, slot };
};

/**
 * Drags the row shown at `fromIndex` to `toIndex` and drops it there. drax
 * ends the drag on release and reports the reorder after the drop animation,
 * so await it.
 */
export const dragRow = async (fromIndex: number, toIndex: number) => {
  const { list, order, slot } = drag(fromIndex);
  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);

  list.items.get(slot)?.onDragDrop?.({});
  list.options.onDragEnd?.({ index: fromIndex, toIndex, cancelled: false });
  if (fromIndex === toIndex) return;

  list.committedOrder = order;
  list.committedKeys = order.map((index) => keyOf(list, index));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  list.options.onReorder({
    fromIndex,
    toIndex,
    data: order.map((index) => list.stableData[index]),
  });
};

/**
 * Drags the row shown at `index` out of the list and drops it there. Only the
 * dragged row hears of it: drax tells the list only about a drop inside it.
 */
export const dropRowOutside = (index: number) => {
  const { list, slot } = drag(index);
  list.items.get(slot)?.onDragEnd?.({ cancelled: false });
};

/** The sortable items in the order drax shows them. */
export const shownItems = <T extends { props: Record<string, unknown> }>(
  items: T[],
): T[] => {
  const order = shownOrder(currentList());
  const position = (item: T) =>
    order.indexOf((item.props.draxItemProps as ItemProps).index);
  return [...items].sort((a, b) => position(a) - position(b));
};

/** How many times a sortable list has reset its rows, mount included. */
export const sortableResets = () => resets;

/** Moves the drax provider on screen, as a sheet scrolling around it does. */
export const moveDraxRoot = (x: number, y: number) => {
  root.page = { x, y };
};

/** The provider's screen position as drax maps a drag with it. */
export const draxRootOffset = () => root.offset.value;
