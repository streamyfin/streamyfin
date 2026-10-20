import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render } from "@testing-library/react-native";
import { useCardGrid } from "./useCardGrid";

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 430, height: 932, scale: 3, fontScale: 1 }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({ basePath: "http://server" }) };
});
jest.mock("expo-router", () => ({ useSegments: () => [] }));
// One router object, as the real hook returns, or the handlers' deps change.
jest.mock("@/hooks/useAppRouter", () => {
  const router = { push: () => {} };
  return { __esModule: true, default: () => router };
});
jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: () => "",
  itemRouter: () => "",
}));
jest.mock("@/components/common/ItemActionSheetHost", () => ({
  ItemActionSheetHost: () => null,
}));
// The artwork pulls in the image stack; the press path does not need it.
jest.mock("./CardArtwork", () => ({ CardArtwork: () => null }));

const movie = (id: string, name: string): BaseItemDto => ({
  Id: id,
  Type: "Movie",
  Name: name,
});

type GridProps = {
  items: BaseItemDto[];
  onPressItem: (item: BaseItemDto) => void;
  onLongPressItem: (item: BaseItemDto) => void;
};

const handlers: {
  press?: (id: string) => void;
  longPress?: (id: string) => void;
}[] = [];

// Renders the real Card through the grid's own renderItem, as a list would.
const Grid = ({ items, onPressItem, onLongPressItem }: GridProps) => {
  const { data, renderItem } = useCardGrid({
    items,
    columns: 2,
    onPressItem,
    onLongPressItem,
  });
  return (
    <>
      {data.map((card, index) => {
        const element = renderItem({ item: card, index }) as any;
        const cardProps = element.props.children.props;
        handlers.push({
          press: cardProps.onPress,
          longPress: cardProps.onLongPress,
        });
        return <Cell key={card.id}>{element}</Cell>;
      })}
    </>
  );
};
const Cell = ({ children }: { children: React.ReactNode }) => <>{children}</>;

beforeEach(() => {
  handlers.length = 0;
});

// A paged list appends items and a refetch swaps an item's object, while the
// cards stay memoized on stable handlers, so a press has to resolve the id
// against the items as they are now, not as they were when the card rendered.
describe("useCardGrid press handlers", () => {
  test("a press and a long press resolve the current item for the card's id", async () => {
    const onPressItem = jest.fn();
    const onLongPressItem = jest.fn();
    const first = [movie("a", "Alpha"), movie("b", "Bravo")];

    const view = await render(
      <Grid
        items={first}
        onPressItem={onPressItem}
        onLongPressItem={onLongPressItem}
      />,
    );
    await fireEvent.press(view.getByText("Bravo"));
    await fireEvent(view.getByText("Bravo"), "longPress");
    expect(onPressItem).toHaveBeenLastCalledWith(first[1]);
    expect(onLongPressItem).toHaveBeenLastCalledWith(first[1]);

    // Page two arrives, and "a" comes back refetched, now played.
    const refetched: BaseItemDto = {
      ...movie("a", "Alpha"),
      UserData: { Played: true },
    };
    const second = [refetched, first[1], movie("c", "Charlie")];
    await view.rerender(
      <Grid
        items={second}
        onPressItem={onPressItem}
        onLongPressItem={onLongPressItem}
      />,
    );

    await fireEvent.press(view.getByText("Alpha"));
    await fireEvent(view.getByText("Alpha"), "longPress");
    await fireEvent.press(view.getByText("Charlie"));
    await fireEvent(view.getByText("Charlie"), "longPress");
    // The very objects the grid holds now: a deep comparison would let a
    // lookup in the first page's items pass.
    expect(onPressItem.mock.calls[1][0]).toBe(refetched);
    expect(onLongPressItem.mock.calls[1][0]).toBe(refetched);
    expect(onPressItem.mock.calls[2][0]).toBe(second[2]);
    expect(onLongPressItem.mock.calls[2][0]).toBe(second[2]);
  });

  test("keeps the same handlers when only the items change", async () => {
    const onPressItem = jest.fn();
    const onLongPressItem = jest.fn();
    const props = { onPressItem, onLongPressItem };

    const view = await render(
      <Grid items={[movie("a", "Alpha")]} {...props} />,
    );
    const before = handlers[0];
    handlers.length = 0;
    await view.rerender(
      <Grid items={[movie("a", "Alpha"), movie("b", "Bravo")]} {...props} />,
    );

    expect(handlers[0].press).toBe(before.press);
    expect(handlers[0].longPress).toBe(before.longPress);
  });
});
