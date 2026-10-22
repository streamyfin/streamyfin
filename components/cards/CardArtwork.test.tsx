import { render, screen } from "@testing-library/react-native";
import { CardArtwork } from "./CardArtwork";
import type { CardData } from "./CardData";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The real image resolves auth headers through the provider tree; the double
// keeps the props each render hands it.
const mockImageProps: Record<string, unknown>[] = [];
jest.mock("@/components/common/ServerImage", () => ({
  Image: (props: Record<string, unknown>) => {
    mockImageProps.push(props);
    return null;
  },
}));

const renderArtwork = (card: Partial<CardData>) =>
  render(
    <CardArtwork
      card={{ id: "card-1", title: "Card", ...card }}
      width={200}
      height={112}
      cornerRadius={14}
    />,
  );

// A list reuses a card's cell for another item. Without a key per item the
// image kept the previous artwork on screen until the new one decoded.
test("keys its image to the card, so a reused cell drops the old artwork", async () => {
  const view = await renderArtwork({ imageUrl: "http://server/a.jpg" });
  expect(mockImageProps.at(-1)?.recyclingKey).toBe("card-1");

  await view.rerender(
    <CardArtwork
      card={{ id: "card-2", title: "Other", imageUrl: "http://server/b.jpg" }}
      width={200}
      height={112}
      cornerRadius={14}
    />,
  );
  expect(mockImageProps.at(-1)?.recyclingKey).toBe("card-2");
});

describe("CardArtwork corner badge", () => {
  test("shows LIVE on a live program", async () => {
    await renderArtwork({ live: true });

    expect(screen.getByText("player.live")).toBeTruthy();
  });

  test("shows no LIVE badge on any other card", async () => {
    await renderArtwork({ live: false, unplayedCount: 3 });

    expect(screen.queryByText("player.live")).toBeNull();
    // The unplayed count keeps the corner.
    expect(screen.getByText("3")).toBeTruthy();
  });
});
