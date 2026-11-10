import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { useState } from "react";
import {
  dragRow,
  draxRootOffset,
  dropRowOutside,
  moveDraxRoot,
  sortableResets,
} from "@/test-utils/drax";
import { DraggableQueueList, type QueueRow } from "./DraggableQueueList";

jest.mock(
  "react-native-drax",
  () => jest.requireActual("@/test-utils/drax").draxModule,
);
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));

const rows: QueueRow[] = [
  { key: "a", title: "First" },
  { key: "b", title: "Second", subtitle: "Artist" },
  { key: "c", title: "Third" },
];

const handlers = () => ({
  onPressRow: jest.fn(),
  onRemoveRow: jest.fn(),
  onMoveRow: jest.fn(),
  onDragActiveChange: jest.fn(),
});

/** Moves its rows on a drop, as the SyncPlay queue and the music queue do. */
const Queue = ({
  initial,
  rekey,
  current,
  scrollable,
  on,
}: {
  initial: QueueRow[];
  /** Keys that carry the index, as the music queue's do. */
  rekey?: boolean;
  /** The title of the playing row. */
  current: string;
  scrollable: boolean;
  on: ReturnType<typeof handlers>;
}) => {
  const [queue, setQueue] = useState(initial);
  const queueRows = rekey
    ? queue.map((row, index) => ({ ...row, key: `${row.title}-${index}` }))
    : queue;
  return (
    <DraggableQueueList
      testID='queue'
      rows={queueRows}
      currentIndex={queue.findIndex((row) => row.title === current)}
      icon='musical-note'
      emptyText='Nothing queued'
      scrollable={scrollable}
      {...on}
      onMoveRow={(from, to) => {
        on.onMoveRow(from, to);
        setQueue((current) => {
          const next = [...current];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          return next;
        });
      }}
    />
  );
};

const draxItems = () =>
  screen
    .getAllByTestId("drax-item")
    .map((item) => item.props.draxItemProps as Record<string, unknown>);

describe.each([
  ["scrolls itself", true],
  ["inside a parent that scrolls", false],
])("DraggableQueueList that %s", (_label, scrollable) => {
  test("shows every row, and a press plays that row", async () => {
    const on = handlers();
    await render(
      <DraggableQueueList
        testID='queue'
        rows={rows}
        currentIndex={0}
        icon='musical-note'
        emptyText='Nothing queued'
        scrollable={scrollable}
        {...on}
      />,
    );

    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.getByText("Artist")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("queue-row-c"));
    expect(on.onPressRow).toHaveBeenCalledWith(2);
  });

  test("moves a dropped row and reports the drag", async () => {
    const on = handlers();
    await render(
      <DraggableQueueList
        rows={rows}
        currentIndex={0}
        icon='musical-note'
        emptyText='Nothing queued'
        scrollable={scrollable}
        {...on}
      />,
    );

    await act(async () => dragRow(2, 0));

    expect(on.onMoveRow).toHaveBeenCalledWith(2, 0);
    expect(on.onDragActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  test("ignores a row dropped where it started", async () => {
    const on = handlers();
    await render(
      <DraggableQueueList
        rows={rows}
        currentIndex={0}
        icon='musical-note'
        emptyText='Nothing queued'
        scrollable={scrollable}
        {...on}
      />,
    );

    await act(async () => dragRow(1, 1));

    expect(on.onMoveRow).not.toHaveBeenCalled();
    expect(on.onDragActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  // drax keeps rendering the rows in their old order after a drop whose new
  // order the parent accepts, and moves them with transforms: a row's place
  // in what drax renders is not its index in the queue any more.
  test("after a drop, a row acts on its own entry", async () => {
    const on = handlers();
    await render(
      <Queue initial={rows} current='First' scrollable={scrollable} on={on} />,
    );

    await act(async () => dragRow(2, 0));

    await fireEvent.press(screen.getByTestId("queue-row-c"));
    expect(on.onPressRow).toHaveBeenCalledWith(0);
    await fireEvent.press(screen.getByTestId("queue-remove-b"));
    expect(on.onRemoveRow).toHaveBeenCalledWith(2);
    // The playing row is the one without a remove button.
    expect(screen.queryByTestId("queue-remove-a")).toBeNull();
    expect(screen.getByTestId("queue-remove-c")).toBeTruthy();
  });

  test("after a drop, rows keyed by their index act on their new place", async () => {
    const on = handlers();
    await render(
      <Queue
        initial={rows}
        rekey
        current='First'
        scrollable={scrollable}
        on={on}
      />,
    );

    await act(async () => dragRow(2, 0));

    await fireEvent.press(screen.getByTestId("queue-row-Third-0"));
    expect(on.onPressRow).toHaveBeenCalledWith(0);
    await fireEvent.press(screen.getByTestId("queue-remove-Second-2"));
    expect(on.onRemoveRow).toHaveBeenCalledWith(2);
  });

  // drax tells the list about a drop inside it only: one outside left the
  // SyncPlay sheet unable to scroll.
  test("a row dropped outside the list still ends the drag", async () => {
    const on = handlers();
    await render(
      <DraggableQueueList
        rows={rows}
        currentIndex={0}
        icon='musical-note'
        emptyText='Nothing queued'
        scrollable={scrollable}
        {...on}
      />,
    );

    await act(async () => dropRowOutside(1));

    expect(on.onMoveRow).not.toHaveBeenCalled();
    expect(on.onDragActiveChange.mock.calls).toEqual([[true], [false]]);
  });

  // Each reset drops the shifts of a drag in progress, and Now Playing
  // renders again every second while music plays.
  test("rendering again with the same rows leaves them in place", async () => {
    const on = handlers();
    const queue = (
      <DraggableQueueList
        rows={rows}
        currentIndex={0}
        icon='musical-note'
        emptyText='Nothing queued'
        scrollable={scrollable}
        {...on}
      />
    );
    const { rerender } = await render(queue);
    const before = sortableResets();

    await rerender(
      <DraggableQueueList
        rows={rows}
        currentIndex={0}
        icon='musical-note'
        emptyText='Nothing queued'
        scrollable={scrollable}
        {...on}
      />,
    );

    expect(sortableResets()).toBe(before);
  });

  // The handle used to sit inside the row's touchable, so a tap on it played
  // the track, or changed the item for the whole SyncPlay group.
  test("a tap on a handle does not press its row", async () => {
    const on = handlers();
    await render(
      <DraggableQueueList
        rows={rows}
        currentIndex={0}
        icon='musical-note'
        emptyText='Nothing queued'
        scrollable={scrollable}
        {...on}
      />,
    );

    await fireEvent.press(screen.getAllByTestId("drax-handle")[2]);

    expect(on.onPressRow).not.toHaveBeenCalled();
  });

  // drax measures where its provider is on screen when it lays out only, and
  // a sheet scrolling around the list moves it without a layout.
  test("a touch on a handle measures where the list is on screen", async () => {
    await render(
      <DraggableQueueList
        rows={rows}
        currentIndex={0}
        icon='musical-note'
        emptyText='Nothing queued'
        scrollable={scrollable}
        {...handlers()}
      />,
    );
    moveDraxRoot(0, -320);

    const handle = screen.getAllByTestId("drax-handle")[1];
    await fireEvent(handle.children[0] as typeof handle, "touchStart");

    expect(draxRootOffset()).toEqual({ x: 0, y: -320 });
    moveDraxRoot(0, 0);
  });

  test("shows its empty text when nothing is queued", async () => {
    await render(
      <DraggableQueueList
        rows={[]}
        currentIndex={-1}
        icon='musical-note'
        emptyText='Nothing queued'
        scrollable={scrollable}
        {...handlers()}
      />,
    );

    expect(screen.getByText("Nothing queued")).toBeTruthy();
  });
});

describe("DraggableQueueList rows", () => {
  // Rows drag from their handle only, at once: the rest of a row scrolls
  // the list (or the sheet around it) and takes presses.
  test("drag from their handle", async () => {
    await render(
      <DraggableQueueList
        rows={rows}
        currentIndex={0}
        icon='musical-note'
        emptyText='Nothing queued'
        {...handlers()}
      />,
    );

    for (const item of draxItems()) {
      expect(item).toMatchObject({ dragHandle: true, draggable: true });
    }
  });

  test("cannot be dragged, pressed or removed while the list is disabled", async () => {
    const on = handlers();
    await render(
      <DraggableQueueList
        testID='queue'
        rows={rows}
        currentIndex={0}
        icon='musical-note'
        emptyText='Nothing queued'
        disabled
        {...on}
      />,
    );

    for (const item of draxItems()) {
      expect(item).toMatchObject({ draggable: false });
    }
    await fireEvent.press(screen.getByTestId("queue-row-b"));
    await fireEvent.press(screen.getByTestId("queue-remove-b"));
    expect(on.onPressRow).not.toHaveBeenCalled();
    expect(on.onRemoveRow).not.toHaveBeenCalled();
  });

  test("keep the playing row unless it can be removed", async () => {
    const on = handlers();
    const { rerender } = await render(
      <DraggableQueueList
        testID='queue'
        rows={rows}
        currentIndex={1}
        icon='musical-note'
        emptyText='Nothing queued'
        {...on}
      />,
    );

    expect(screen.queryByTestId("queue-remove-b")).toBeNull();
    await fireEvent.press(screen.getByTestId("queue-remove-c"));
    expect(on.onRemoveRow).toHaveBeenCalledWith(2);

    await rerender(
      <DraggableQueueList
        testID='queue'
        rows={rows}
        currentIndex={1}
        icon='musical-note'
        emptyText='Nothing queued'
        canRemoveCurrent
        {...on}
      />,
    );
    expect(screen.getByTestId("queue-remove-b")).toBeTruthy();
  });
});
