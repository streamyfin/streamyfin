import { act, fireEvent, screen } from "@testing-library/react-native";
import { measureRenders } from "reassure";
import AppearancePage from "@/app/(auth)/(tabs)/(home)/settings/appearance/page";

jest.mock(
  "@/providers/GlobalModalProvider",
  () => jest.requireActual("@/test-utils/appProviders").globalModalModule,
);

describe("Settings Performance", () => {
  test("toggling a setting re-renders the appearance page", async () => {
    await measureRenders(<AppearancePage />, {
      scenario: async () => {
        const switches = await screen.findAllByRole("switch");
        for (const toggle of switches) {
          await fireEvent(toggle, "valueChange", true);
        }
        for (const toggle of switches) {
          await fireEvent(toggle, "valueChange", false);
        }
        await act(async () => {
          jest.advanceTimersByTime(500);
        });
      },
    });
  });
});
