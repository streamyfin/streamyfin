import { render, screen } from "@testing-library/react-native";
import { CardArtwork } from "./CardArtwork";
import type { CardData } from "./CardData";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The artwork itself is not under test, and the real image resolves auth
// headers through the provider tree.
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));

const renderArtwork = (card: Partial<CardData>) =>
  render(
    <CardArtwork
      card={{ id: "card-1", title: "Card", ...card }}
      width={200}
      height={112}
      cornerRadius={14}
    />,
  );

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
