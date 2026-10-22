import { act, fireEvent, screen } from "@testing-library/react-native";
import { measureRenders } from "reassure";
import { PluginSettings } from "./PluginSettings";

describe("Plugin settings performance", () => {
  test("toggling a setting re-renders the plugin settings", async () => {
    await measureRenders(<PluginSettings />, {
      scenario: async () => {
        const switches = await screen.findAllByRole("switch");
        for (const toggle of switches) {
          await fireEvent(toggle, "valueChange", !toggle.props.value);
        }
        for (const toggle of switches) {
          await fireEvent(toggle, "valueChange", !toggle.props.value);
        }
        await act(async () => {
          jest.advanceTimersByTime(500);
        });
      },
    });
  });
});
