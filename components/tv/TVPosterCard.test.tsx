import { render, screen } from "@testing-library/react-native";
import { TVPosterCard } from "./TVPosterCard";

jest.mock("@/providers/JellyfinProvider", () =>
  jest.requireActual("@/test-utils/jellyfinProviderModule"),
);

jest.mock("@/components/WatchedIndicator", () => ({
  UnplayedCountBadge: () => null,
  WatchedIndicator: () => null,
}));
jest.mock("@/modules/glass-poster", () => ({
  GlassPosterView: () => null,
  isGlassEffectAvailable: () => false,
}));
jest.mock("@/constants/TVPosterSizes", () => ({
  useScaledTVPosterSizes: () => ({ poster: 200, episode: 300 }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ callout: 20, body: 20, heading: 30 }),
}));

// The badge on the episode a page is about read "Now Playing" in English
// whatever the language (seen in French on an Android TV, 2026-11-03).
test("the badge of the current item speaks the user's language", async () => {
  await render(
    <TVPosterCard
      item={{ Id: "e1", Name: "Pilot", Type: "Episode" }}
      orientation='horizontal'
      imageUrlGetter={() =>
        "https://jellyfin.example.com/Items/e1/Images/Primary"
      }
      isCurrent
      onPress={() => {}}
    />,
  );

  expect(screen.getByText("player.now_playing")).toBeTruthy();
  expect(screen.queryByText("Now Playing")).toBeNull();
});
