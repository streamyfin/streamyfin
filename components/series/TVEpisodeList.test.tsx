import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { render, screen } from "@testing-library/react-native";
import { TVEpisodeList } from "./TVEpisodeList";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ heading: 1, callout: 1 }),
}));
jest.mock("@/constants/TVSizes", () => ({
  useScaledTVSizes: () => ({ padding: { scale: 0 }, gaps: { item: 0 } }),
}));
// An episode shows up as its name, with whatever the list draws over it.
jest.mock("@/components/tv/TVPosterCard", () => ({
  TVPosterCard: (props: { item: BaseItemDto; overlay?: React.ReactNode }) => {
    const { Text, View } = jest.requireActual("react-native");
    return (
      <View>
        <Text>{props.item.Name}</Text>
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
