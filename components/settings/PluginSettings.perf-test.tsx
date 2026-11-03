import { act, fireEvent, screen } from "@testing-library/react-native";
import { measureRenders } from "reassure";
import { PluginSettings } from "./PluginSettings";

describe("Plugin settings performance", () => {
  test("toggling a setting re-renders the plugin settings", async () => {
    await measureRenders(<PluginSettings />, {
      scenario: async () => {
        const switches = await screen.findAllByRole("switch");
        // Explicit values: the host switch carries `value` on iOS only (Android
        // gets `on`), and all three settings start on.
        for (const toggle of switches) {
          await fireEvent(toggle, "valueChange", false);
        }
        for (const toggle of switches) {
          await fireEvent(toggle, "valueChange", true);
        }
        await act(async () => {
          jest.advanceTimersByTime(500);
        });
      },
    });
  });
});
