import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TVSimilarItems } from "./TVSimilarItems";

let mockSimilarItems: BaseItemDto[] | undefined;
const mockPush = jest.fn();
const mockShowItemActions = jest.fn();

jest.mock("@/hooks/useSimilarItems", () => ({
  useSimilarItems: () => ({ data: mockSimilarItems }),
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
jest.mock("expo-router", () => ({ useSegments: () => [] }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/hooks/useTVItemActionModal", () => ({
  useTVItemActionModal: () => ({ showItemActions: mockShowItemActions }),
}));
// The route helper sits in a module that also draws the mobile action sheet,
// which reaches the providers and their storage: only the helper is wanted.
jest.mock("@/hooks/useItemActionSheet", () => ({
  useItemActionSheet: () => ({}),
}));
// The TV sizes read the type scale from the settings, and its enum with it.
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
  TVTypographyScale: {
    Small: "small",
    Default: "default",
    Large: "large",
    ExtraLarge: "extraLarge",
  },
}));
// The poster itself is not under test: a pressable carrying the item's name
// stands for it, with the handlers the row gives it.
jest.mock("@/components/tv/TVPosterCard", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    TVPosterCard: ({
      item,
      onPress,
      onLongPress,
    }: {
      item: { Name?: string | null };
      onPress: () => void;
      onLongPress: () => void;
    }) => (
      <Pressable onPress={onPress} onLongPress={onLongPress}>
        <Text>{item.Name}</Text>
      </Pressable>
    ),
  };
});

const series: BaseItemDto = { Id: "series-1", Type: "Series" };
const ozark: BaseItemDto = { Id: "series-2", Name: "Ozark", Type: "Series" };

beforeEach(() => {
  mockSimilarItems = undefined;
  mockPush.mockClear();
  mockShowItemActions.mockClear();
});

describe("TVSimilarItems", () => {
  // An empty row would still be a heading, and a stop for the focus engine.
  test.each([
    ["while the list loads", undefined],
    ["when the server has nothing similar", []],
  ])("draws nothing %s", async (_case, similarItems) => {
    mockSimilarItems = similarItems;

    await render(<TVSimilarItems item={series} />);

    expect(screen.queryByText("item_card.similar_items")).toBeNull();
  });

  test("shows the similar items under their heading", async () => {
    mockSimilarItems = [ozark];

    await render(<TVSimilarItems item={series} />);

    expect(screen.getByText("item_card.similar_items")).toBeTruthy();
    expect(screen.getByText("Ozark")).toBeTruthy();
  });

  test("opens the similar item that is pressed", async () => {
    mockSimilarItems = [ozark];
    await render(<TVSimilarItems item={series} />);

    await fireEvent.press(screen.getByText("Ozark"));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/series/[id]",
      params: { id: "series-2" },
    });
  });

  test("offers the item's actions on a long press", async () => {
    mockSimilarItems = [ozark];
    await render(<TVSimilarItems item={series} />);

    await fireEvent(screen.getByText("Ozark"), "longPress");

    expect(mockShowItemActions).toHaveBeenCalledWith(ozark);
  });
});
