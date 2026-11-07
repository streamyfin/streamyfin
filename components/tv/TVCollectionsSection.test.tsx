import { fireEvent, render, screen } from "@testing-library/react-native";
// The TV size hooks only read the typography scale; the real module pulls in
// the settings UI with it.
// The poster artwork is not what this spec is about, and the real component
// brings the proxy-header machinery along.
import { TVCollectionsSection } from "./TVCollectionsSection";

jest.mock("@/providers/JellyfinProvider", () =>
  jest.requireActual("@/test-utils/jellyfinProviderModule"),
);

const trilogy = {
  Id: "boxset-1",
  Name: "The Trilogy",
  Type: "BoxSet" as const,
};
const saga = { Id: "boxset-2", Name: "The Saga", Type: "BoxSet" as const };

describe("TVCollectionsSection", () => {
  test("opens the collection whose poster is pressed", async () => {
    const onCollectionPress = jest.fn();
    await render(
      <TVCollectionsSection
        collections={[trilogy, saga]}
        onCollectionPress={onCollectionPress}
      />,
    );

    expect(screen.getByText("item_card.collections")).toBeTruthy();
    await fireEvent.press(screen.getByText("The Saga"));

    expect(onCollectionPress).toHaveBeenCalledTimes(1);
    expect(onCollectionPress).toHaveBeenCalledWith(saga);
  });

  // An item in no collection, and every item on a server older than
  // Jellyfin 12: no heading over an empty row.
  test("draws nothing for an item in no collection", async () => {
    await render(
      <TVCollectionsSection collections={[]} onCollectionPress={jest.fn()} />,
    );

    expect(screen.toJSON()).toBeNull();
  });
});
