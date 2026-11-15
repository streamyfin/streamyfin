import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { render, screen } from "@testing-library/react-native";
import { TVEpisodeList } from "./TVEpisodeList";

jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ heading: 1, callout: 1 }),
}));
jest.mock("@/constants/TVSizes", () => ({
  useScaledTVSizes: () => ({ padding: { scale: 0 }, gaps: { item: 0 } }),
  useScaledTVPosterSizes: () => ({ poster: 200, episode: 300 }),
}));
// An episode shows up as its name, with whatever the list draws over it.
jest.mock("@/components/tv/TVPosterCard", () => ({
  TVPosterCard: (props: {
    item: BaseItemDto;
    overlay?: React.ReactNode;
    preferEpisodeImage?: boolean;
  }) => {
    const { Text, View } = jest.requireActual("react-native");
    return (
      <View>
        <Text>{props.item.Name}</Text>
        <Text>
          {props.preferEpisodeImage
            ? "episode-image-preferred"
            : "series-image-preferred"}
        </Text>
        {props.overlay}
      </View>
    );
  },
}));

const episode = (name: string, extra: Partial<BaseItemDto>): BaseItemDto => ({
  Id: name,
  Name: name,
  Type: "Episode",
  ...extra,
});

// A season list includes the episodes the library has no file for when the
// user asks for missing episodes. Nothing told them apart from the others.
test("marks the episodes that have no file to play", async () => {
  await render(
    <TVEpisodeList
      onEpisodePress={() => {}}
      episodes={[
        episode("Aired", { LocationType: "FileSystem" }),
        episode("Lost", {
          LocationType: "Virtual",
          PremiereDate: "2020-01-01T00:00:00.0000000Z",
        }),
        episode("Soon", {
          LocationType: "Virtual",
          PremiereDate: "2099-01-01T00:00:00.0000000Z",
        }),
      ]}
    />,
  );

  expect(screen.getAllByText("item_card.missing")).toHaveLength(1);
  expect(screen.getAllByText("item_card.not_yet_aired")).toHaveLength(1);
});

// Every episode used to show the series' image (#1764). Each shows its own, as
// on the phone, whatever the Next up setting picks for the home rows.
test("shows each episode with its own image", async () => {
  await render(
    <TVEpisodeList
      onEpisodePress={() => {}}
      episodes={[
        episode("Pilot", { LocationType: "FileSystem" }),
        episode("Finale", { LocationType: "FileSystem" }),
      ]}
    />,
  );

  expect(screen.getAllByText("episode-image-preferred")).toHaveLength(2);
  expect(screen.queryByText("series-image-preferred")).toBeNull();
});

// A season said it had no episodes while they were still on their way (seen
// on an Android TV, 2026-11-03), then showed them.
test("says nothing about an empty season while its episodes load", async () => {
  const view = await render(
    <TVEpisodeList
      onEpisodePress={() => {}}
      episodes={[]}
      isLoading
      emptyText='No episodes'
    />,
  );
  expect(screen.queryByText("No episodes")).toBeNull();

  await view.rerender(
    <TVEpisodeList
      onEpisodePress={() => {}}
      episodes={[]}
      isLoading={false}
      emptyText='No episodes'
    />,
  );
  expect(screen.getByText("No episodes")).toBeTruthy();
});

// An empty row read as nothing happening: while the episodes load, cards in
// their shape hold the row.
test("holds the row with card placeholders while the episodes load", async () => {
  const view = await render(
    <TVEpisodeList onEpisodePress={() => {}} episodes={[]} isLoading />,
  );
  expect(screen.getAllByTestId("tv-episode-skeleton").length).toBeGreaterThan(
    0,
  );

  await view.rerender(
    <TVEpisodeList
      onEpisodePress={() => {}}
      episodes={[episode("Pilot", { LocationType: "FileSystem" })]}
      isLoading={false}
    />,
  );
  expect(screen.queryByTestId("tv-episode-skeleton")).toBeNull();
  expect(screen.getByText("Pilot")).toBeTruthy();
});

// The cards that replace the placeholders carry a label line and a title under
// the image: a placeholder of the image alone made the row grow, and the
// sections below it jump, when the episodes arrived.
test("the placeholders hold the label and title lines of the cards too", async () => {
  await render(
    <TVEpisodeList onEpisodePress={() => {}} episodes={[]} isLoading />,
  );

  const cards = screen.getAllByTestId("tv-episode-skeleton");
  // Hidden from spoken feedback, as the next test shows: still drawn.
  expect(
    screen.getAllByTestId("tv-episode-skeleton-text", {
      includeHiddenElements: true,
    }),
  ).toHaveLength(cards.length);
});

// The placeholder lines are text, there only for their height: read aloud, they
// named an episode that is not there.
test("the placeholders' text is not read out", async () => {
  await render(
    <TVEpisodeList onEpisodePress={() => {}} episodes={[]} isLoading />,
  );

  expect(screen.queryByText("S1:E1 • 45 min")).toBeNull();
  expect(screen.queryByText("Episode title")).toBeNull();
});
