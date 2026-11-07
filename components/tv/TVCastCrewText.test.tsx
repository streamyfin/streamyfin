import type { BaseItemPerson } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TVCastCrewText } from "./TVCastCrewText";

jest.mock("@/providers/JellyfinProvider", () =>
  jest.requireActual("@/test-utils/jellyfinProviderModule"),
);

// The real hook reads the settings atom, whose module graph is the whole app.
jest.mock(
  "@/constants/TVTypography",
  () => jest.requireActual("@/test-utils/stubModules").emptyTVTypographyModule,
);

const PEOPLE: BaseItemPerson[] = [
  { Id: "gilligan", Name: "Vince Gilligan", Type: "Creator" },
  { Id: "gilligan", Name: "Vince Gilligan", Type: "Director" },
  { Id: "gould", Name: "Peter Gould", Type: "Writer" },
];

describe("TVCastCrewText", () => {
  test("a credited name opens that person", async () => {
    const onPersonPress = jest.fn();
    await render(
      <TVCastCrewText people={PEOPLE} onPersonPress={onPersonPress} />,
    );

    expect(screen.getByText("item_card.credits.Creator")).toBeTruthy();
    fireEvent.press(screen.getByText("Peter Gould"));

    expect(onPersonPress).toHaveBeenCalledWith("gould");
  });

  // The series page keeps its season modal on top of these names: the remote
  // must not reach, let alone open, what sits behind it.
  test("a disabled name cannot be opened", async () => {
    const onPersonPress = jest.fn();
    await render(
      <TVCastCrewText people={PEOPLE} onPersonPress={onPersonPress} disabled />,
    );

    fireEvent.press(screen.getByText("Peter Gould"));

    expect(onPersonPress).not.toHaveBeenCalled();
  });

  // Offline there is no person page to open: the names stay readable.
  test("without a handler the names are plain text", async () => {
    await render(<TVCastCrewText people={PEOPLE} />);

    expect(screen.getByText("Peter Gould")).toBeTruthy();
    expect(screen.getAllByText("Vince Gilligan")).toHaveLength(2);
  });

  test("draws nothing when nobody is credited and the cast is hidden", async () => {
    await render(
      <TVCastCrewText
        people={[{ Id: "a", Name: "An Actor", Type: "Actor" }]}
        cast={[{ Id: "a", Name: "An Actor", Type: "Actor" }]}
        hideCast
      />,
    );

    expect(screen.toJSON()).toBeNull();
  });
});
