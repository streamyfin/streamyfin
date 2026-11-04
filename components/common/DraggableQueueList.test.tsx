import { render, screen } from "@testing-library/react-native";
import { DraggableQueueList, type QueueRow } from "./DraggableQueueList";

// The real list needs gesture handlers. This one renders the same rows.
jest.mock("react-native-draggable-flatlist", () => {
  const { View } = jest.requireActual("react-native");
  const List = ({ data, renderItem, keyExtractor, testID }: any) => (
    <View testID={testID}>
      {data.map((item: any, index: number) => (
        <View key={keyExtractor(item)}>
          {renderItem({
            item,
            drag: () => {},
            isActive: false,
            getIndex: () => index,
          })}
        </View>
      ))}
    </View>
  );
  return {
    __esModule: true,
    default: List,
    ScaleDecorator: ({ children }: any) => children,
  };
});
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));

const rows: QueueRow[] = [
  { key: "a-0", title: "A" },
  { key: "b-1", title: "B" },
];

const renderList = (editable?: boolean) =>
  render(
    <DraggableQueueList
      rows={rows}
      currentIndex={0}
      icon='musical-note'
      emptyText='Empty'
      testID='queue'
      editable={editable}
      onPressRow={() => {}}
      onRemoveRow={() => {}}
      onMoveRow={() => {}}
    />,
  );

test("rows offer a handle to move them and a button to remove them", async () => {
  await renderList();

  expect(screen.getByTestId("queue-handle-b-1")).toBeTruthy();
  expect(screen.getByTestId("queue-remove-b-1")).toBeTruthy();
});

// A Cast receiver playing the queue has no command to move or remove a track.
test("rows of a queue that cannot be edited offer neither", async () => {
  await renderList(false);

  expect(screen.getByTestId("queue-row-b-1")).toBeTruthy();
  expect(screen.queryByTestId("queue-handle-b-1")).toBeNull();
  expect(screen.queryByTestId("queue-remove-b-1")).toBeNull();
});
