import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { TestInstance } from "test-renderer";
import { TVPosterCard } from "./TVPosterCard";

jest.mock("@/providers/JellyfinProvider", () =>
  jest.requireActual("@/test-utils/realSessionAtoms"),
);

jest.mock("@/components/WatchedIndicator", () => ({
  UnplayedCountBadge: () => null,
  WatchedIndicator: () => null,
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

// Seerr cards pass showProgress={false}, but only the retired glass path read
// it: the progress bar showed on them regardless.
test("showProgress={false} hides the progress bar", async () => {
  const item = {
    Id: "m1",
    Name: "Film",
    Type: "Movie",
    UserData: { Key: "m1", ItemId: "m1", PlayedPercentage: 50 },
  } satisfies BaseItemDto;
  const bars = (root: TestInstance) =>
    root.queryAll(
      (node) => StyleSheet.flatten(node.props.style)?.width === "50%",
    );

  const shown = await render(
    <TVPosterCard
      item={item}
      imageUrlGetter={() =>
        "https://jellyfin.example.com/Items/m1/Images/Primary"
      }
      onPress={() => {}}
    />,
  );
  expect(bars(shown.root!)).not.toHaveLength(0);
  shown.unmount();

  const hidden = await render(
    <TVPosterCard
      item={item}
      imageUrlGetter={() =>
        "https://jellyfin.example.com/Items/m1/Images/Primary"
      }
      showProgress={false}
      onPress={() => {}}
    />,
  );
  expect(bars(hidden.root!)).toHaveLength(0);
});
