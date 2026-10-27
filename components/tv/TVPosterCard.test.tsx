import { render, screen } from "@testing-library/react-native";
import { TVPosterCard } from "./TVPosterCard";

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null) };
});
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));
// The real size hooks read the settings atom, which pulls in native UI.
jest.mock("@/constants/TVPosterSizes", () => ({
  useScaledTVPosterSizes: () => ({ poster: 200, landscape: 300, episode: 300 }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ callout: 26 }),
}));
jest.mock("@/components/WatchedIndicator", () => ({
  UnplayedCountBadge: () => null,
  WatchedIndicator: () => null,
}));
jest.mock("@/components/common/ProgressBar", () => ({
  ProgressBar: () => null,
}));
jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
}));

const season = {
  Id: "s2",
  Type: "Season" as const,
  Name: "Season 2",
  SeriesName: "Some Show",
  ProductionYear: 2019,
};

describe("TVPosterCard with a season", () => {
  // A watchlist row mixes seasons from many shows; "Season 2" alone says
  // nothing there, so the show's name leads and the season name follows.
  test("titles the season with its show when asked to", async () => {
    await render(
      <TVPosterCard item={season} onPress={() => {}} displayShowName />,
    );

    expect(screen.getByText("Some Show")).toBeTruthy();
    expect(screen.getByText("Season 2")).toBeTruthy();
    expect(screen.queryByText("2019")).toBeNull();
  });

  test("keeps the plain season title everywhere else", async () => {
    await render(<TVPosterCard item={season} onPress={() => {}} />);

    expect(screen.getByText("Season 2")).toBeTruthy();
    expect(screen.queryByText("Some Show")).toBeNull();
  });
});
