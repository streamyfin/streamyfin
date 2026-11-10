import { render, screen } from "@testing-library/react-native";
import { createElement } from "react";
import ProgressCircle, { ringDashOffset } from "./ProgressCircle";

jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("@/test-utils/reanimated").reanimatedModule,
  __esModule: true,
}));

describe("ringDashOffset", () => {
  const circumference = 100;

  test("leaves the given share of the ring drawn", () => {
    expect(ringDashOffset(circumference, 0)).toBe(100);
    expect(ringDashOffset(circumference, 25)).toBe(75);
    expect(ringDashOffset(circumference, 100)).toBe(0);
  });

  test("clamps progress outside 0 to 100", () => {
    expect(ringDashOffset(circumference, -5)).toBe(100);
    expect(ringDashOffset(circumference, 140)).toBe(0);
  });
});

type HostNode = {
  type: string;
  props: Record<string, unknown>;
  children?: unknown[] | null;
};

/** The ring's circles as drawn, the track first. */
const drawnCircles = () => {
  const found: HostNode[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const host = node as HostNode;
    if (host.type === "RNSVGCircle") found.push(host);
    host.children?.forEach(visit);
  };
  visit(screen.toJSON());
  return found;
};

describe("ProgressCircle", () => {
  // The fill reaches the ring through a shared value written after the first
  // render, as on the UI thread: a ring rendered on its own must still show it.
  test("draws a ring rendered on its own filled to its value", async () => {
    await render(
      createElement(ProgressCircle, {
        size: 40,
        fill: 40,
        width: 4,
        tintColor: "#fff",
        backgroundColor: "#000",
      }),
    );

    const [, ring] = drawnCircles();
    const circumference = 2 * Math.PI * Number(ring.props.r);
    expect(ring.props.strokeDashoffset).toBeCloseTo(circumference * 0.6);
  });
});
