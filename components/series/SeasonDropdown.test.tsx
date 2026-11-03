import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, render, screen } from "@testing-library/react-native";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { SeasonDropdown } from "./SeasonDropdown";

// The options show as their labels; the menu itself is not under test.
jest.mock("../PlatformDropdown", () => ({
  PlatformDropdown: ({
    groups,
  }: {
    groups: { options: { label: string }[] }[];
  }) => {
    const { Text } = jest.requireActual("react-native");
    return groups[0].options.map((option) => (
      <Text key={option.label}>{option.label}</Text>
    ));
  },
}));

const SERIES: BaseItemDto = { Id: "series-1", Type: "Series", Name: "Show" };

beforeAll(() =>
  i18next.use(initReactI18next).init({
    lng: "en",
    resources: {
      en: {
        translation: { seerr: { season_number: "Season {{season_number}}" } },
      },
      fr: {
        translation: { seerr: { season_number: "Saison {{season_number}}" } },
      },
    },
  }),
);

afterEach(() => act(() => i18next.changeLanguage("en")));

describe("SeasonDropdown", () => {
  // A season the server gave no name, as the offline pages build them: the
  // dropdown names it in the app's language, and follows a language change.
  test("names a season without a name in the app's language", async () => {
    await render(
      <SeasonDropdown
        item={SERIES}
        seasons={[{ Id: "season-2", IndexNumber: 2 }]}
        state={{}}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByText("Season 2")).toBeTruthy();
    await act(() => i18next.changeLanguage("fr"));
    expect(screen.getByText("Saison 2")).toBeTruthy();
  });
});
