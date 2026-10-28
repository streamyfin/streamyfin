import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import type { ServerUrlResolverState } from "@/hooks/useServerUrlResolver";
import { ServerUrlStatusText } from "./ServerUrlStatusText";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const unreachable: ServerUrlResolverState = {
  status: "error",
  reason: "unreachable",
};

describe("ServerUrlStatusText", () => {
  // The component used to read `className`, which NativeWind has already
  // turned into `style` by the time the props arrive. Every caller's spacing
  // was dropped, and the message sat against the edge of the input above it.
  test("keeps the spacing its caller asks for", async () => {
    await render(
      <ServerUrlStatusText state={unreachable} className='mt-2 px-4' />,
    );

    const message = screen.getByText("server_url.unreachable");
    expect(StyleSheet.flatten(message.props.style)).toMatchObject({
      marginTop: 8,
      paddingLeft: 16,
      paddingRight: 16,
    });
  });

  test("keeps its own colour next to the caller's spacing", async () => {
    await render(<ServerUrlStatusText state={unreachable} className='mt-2' />);

    const message = screen.getByText("server_url.unreachable");
    expect(StyleSheet.flatten(message.props.style)).toMatchObject({
      color: "#ef4444",
      marginTop: 8,
    });
  });

  test("renders nothing while idle", async () => {
    const view = await render(
      <ServerUrlStatusText state={{ status: "idle" }} className='mt-2' />,
    );

    expect(view.toJSON()).toBeNull();
  });
});
