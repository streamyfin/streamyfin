import type { BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import { render, screen, waitFor } from "@testing-library/react-native";
import { ItemPeopleSections } from "./ItemPeopleSections";

const mockPeople: BaseItemPerson[] = [
  { Id: "director", Name: "Director", Type: "Director" },
  { Id: "a", Name: "Ana", Type: "Actor", Role: "Hero" },
  { Id: "a", Name: "Ana", Type: "Actor", Role: "Mother" },
  { Id: "b", Name: "Ben", Type: "Actor" },
  { Id: "c", Name: "Cy", Type: "Actor" },
  { Id: "d", Name: "Dee", Type: "Actor" },
];

jest.mock("@/hooks/useItemPeopleQuery", () => ({
  useItemPeopleQuery: () => ({ data: mockPeople, isLoading: false }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => false,
}));
jest.mock("@/components/series/CastAndCrew", () => ({
  CastAndCrew: () => null,
}));
jest.mock("@/components/MoreMoviesWithActor", () => ({
  MoreMoviesWithActor: ({ actorName }: { actorName: string }) => {
    const { Text } = jest.requireActual("react-native");
    return <Text>{actorName}</Text>;
  },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

test("actor sections skip crew and count each actor once", async () => {
  await render(<ItemPeopleSections item={{ Id: "movie" }} />);
  await waitFor(() => expect(screen.getByText("Cy")).toBeTruthy());

  expect(screen.getByText("Ana")).toBeTruthy();
  expect(screen.getByText("Ben")).toBeTruthy();
  expect(screen.queryByText("Director")).toBeNull();
  expect(screen.queryByText("Dee")).toBeNull();
});
