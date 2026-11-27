import { render, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeApi } from "@/test-utils/jellyfinApi";
import { TVPosterCard } from "./TVPosterCard";

jest.mock("@/providers/JellyfinProvider", () =>
  jest.requireActual("@/test-utils/realSessionAtoms"),
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

describe("the artwork a card requests", () => {
  beforeEach(() => {
    getDefaultStore().set(apiAtom, makeApi());
  });

  const images = () => screen.queryAllByTestId(/^image /);

  // An episode of a series that has no Thumb used to fall through to a request
  // for the series' Thumb without a tag, which the server answers with a 404.
  test("a horizontal episode without a parent Thumb shows the series backdrop", async () => {
    await render(
      <TVPosterCard
        item={{
          Id: "e1",
          Name: "Pilot",
          Type: "Episode",
          ParentBackdropItemId: "series-1",
          ParentBackdropImageTags: ["bd-tag"],
          ImageTags: { Primary: "ep-tag" },
        }}
        orientation='horizontal'
        onPress={() => {}}
      />,
    );

    const [image] = images();
    expect(image.props.testID).toContain("/Items/series-1/Images/Backdrop?");
    expect(image.props.testID).toContain("tag=bd-tag");
    expect(image.props.testID).toContain("fillHeight=700");
  });

  test("a horizontal episode that prefers its own image shows its still", async () => {
    await render(
      <TVPosterCard
        item={{
          Id: "e1",
          Name: "Pilot",
          Type: "Episode",
          ParentThumbItemId: "series-1",
          ParentThumbImageTag: "thumb-tag",
          ImageTags: { Primary: "ep-tag" },
        }}
        orientation='horizontal'
        preferEpisodeImage
        onPress={() => {}}
      />,
    );

    const [image] = images();
    expect(image.props.testID).toContain("/Items/e1/Images/Primary?");
    expect(image.props.testID).toContain("fillHeight=700");
  });

  test.each(["horizontal", "vertical"] as const)(
    "an item without image tags draws the placeholder and requests nothing (%s)",
    async (orientation) => {
      await render(
        <TVPosterCard
          item={{ Id: "m1", Name: "Film", Type: "Movie", ImageTags: {} }}
          orientation={orientation}
          onPress={() => {}}
        />,
      );

      expect(images()).toHaveLength(0);
      expect(screen.getByText("Film")).toBeTruthy();
    },
  );
});
