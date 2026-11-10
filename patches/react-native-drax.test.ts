import path from "node:path";
import { render, renderHook, screen } from "@testing-library/react-native";
import { createElement } from "react";
import { StyleSheet, Text } from "react-native";

// Pins patches/react-native-drax@1.1.0.patch. Two fixes together let a drop
// reorder the list in a release build:
//
// - Since 3.0.0-beta.3, Gesture Handler calls onDeactivate and onFinalize with
//   the event alone and puts the end flag on it, as `canceled`
//   (software-mansion/react-native-gesture-handler#3887). drax 1.1.0 hands its
//   onFinalize, which still reads a second `didSucceed` argument, straight to
//   usePanGesture: every drop also ended as a cancel.
// - SortableItem read the container's onItemSnapEnd when it rendered, but the
//   container only sets it in a layout effect, after its items rendered. An
//   item that did not render again kept none, so the end of the snap animation
//   never committed the reorder. It showed in release builds only.
//
// The third draws the dragged row: the hover layer spread
// StyleSheet.absoluteFillObject, which React Native no longer exports (0.86
// has absoluteFill only). The layer lost its absolute position and sat below
// the list in its layout, so the translation that follows the finger moved it
// out of view, and the row being dragged was never drawn.

const mockUsePanGesture = jest.fn((config: unknown) => config);
jest.mock("react-native-gesture-handler", () => ({
  usePanGesture: (config: unknown) => mockUsePanGesture(config),
}));
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  return {
    ...jest.requireActual("@/test-utils/reanimated").reanimatedModule,
    __esModule: true,
    default: { View },
    useDerivedValue: (derive: () => unknown) => ({ value: derive() }),
    useReducedMotion: () => false,
    withSpring: (toValue: unknown) => toValue,
  };
});
jest.mock("react-native-worklets", () => ({ runOnJS: jest.fn() }));

// Metro bundles the sources (the package's "react-native" entry), Jest loads
// lib/module: the patch covers both, and so does this spec. The package's
// exports map only lets package.json through, hence the absolute paths.
const root = path.dirname(require.resolve("react-native-drax/package.json"));
const builds = {
  src: { dir: path.join(root, "src"), ext: ".tsx" },
  "lib/module": { dir: path.join(root, "lib/module"), ext: ".js" },
};

type FinalizeCallback = (event: { canceled: boolean }) => void;

const finalizeWith = async (dir: string, canceled: boolean) => {
  const { useDraxPanGesture } = require(
    path.join(dir, "compat/useDraxPanGesture"),
  );
  const onFinalize = jest.fn();
  await renderHook(() =>
    useDraxPanGesture({
      enabledSV: { value: true },
      longPressDelaySV: { value: 0 },
      maxPointers: 1,
      shouldCancelWhenOutside: false,
      onActivate: jest.fn(),
      onUpdate: jest.fn(),
      onDeactivate: jest.fn(),
      onFinalize,
    }),
  );
  const passed = mockUsePanGesture.mock.calls.at(-1)?.[0] as {
    onFinalize: FinalizeCallback;
  };
  passed.onFinalize({ canceled });
  return onFinalize;
};

describe.each(Object.entries(builds))("react-native-drax %s", (_, build) => {
  let draxViewProps: { onSnapEnd: (data: object) => void };
  beforeAll(() => {
    jest.mock(path.join(build.dir, "DraxView"), () => ({
      DraxView: (props: typeof draxViewProps & { children: unknown }) => {
        draxViewProps = props;
        return props.children;
      },
    }));
    jest.mock(path.join(build.dir, "hooks/useDraxContext"), () => ({
      useDraxContext: () => ({
        hoverReadySV: { value: false },
        draggedIdSV: { value: "" },
      }),
    }));
  });
  beforeEach(() => mockUsePanGesture.mockClear());

  it("reports a drop as a success", async () => {
    const onFinalize = await finalizeWith(build.dir, false);
    expect(onFinalize).toHaveBeenCalledTimes(1);
    expect(onFinalize).toHaveBeenCalledWith({ canceled: false }, true);
  });

  it("reports a cancelled drag as a failure", async () => {
    const onFinalize = await finalizeWith(build.dir, true);
    expect(onFinalize).toHaveBeenCalledWith({ canceled: true }, false);
  });

  it("ends a snap with the handler the container set after the item rendered", async () => {
    const { SortableItem } = require(path.join(build.dir, "SortableItem"));
    const internal: Record<string, unknown> = {
      horizontal: false,
      lockToMainAxis: true,
      longPressDelay: 0,
      shiftsRef: { value: {} },
      instantClearSV: { value: false },
      shiftsValidSV: { value: true },
      itemMeasurements: { current: new Map() },
      keyExtractor: (item: string) => item,
      rawData: ["a"],
      originalIndexes: [0],
      scrollPosition: { value: { x: 0, y: 0 } },
      fixedKeys: { current: new Set() },
      onItemSnapEnd: undefined,
    };
    await render(
      createElement(
        SortableItem,
        { sortable: { _internal: internal }, index: 0 },
        createElement(Text, null, "a"),
      ),
    );

    // What the container's layout effect does once its items rendered.
    const onItemSnapEnd = jest.fn();
    internal.onItemSnapEnd = onItemSnapEnd;
    draxViewProps.onSnapEnd({});

    expect(onItemSnapEnd).toHaveBeenCalledTimes(1);
  });

  it("lays the hover over the whole provider, out of the list's layout", async () => {
    const { HoverLayer } = require(path.join(build.dir, "HoverLayer"));
    await render(
      createElement(HoverLayer, {
        hoverContentRef: { current: null },
        hoverVersion: 0,
        hoverPositionSV: { value: { x: 0, y: 0 } },
        dragPhaseSV: { value: "idle" },
        receiverIdSV: { value: "" },
        hoverReadySV: { value: false },
        hoverDimsSV: { value: { x: 0, y: 0 } },
        hoverStylesRef: { current: null },
      }),
    );

    const layer = screen.toJSON();
    if (!layer || Array.isArray(layer)) throw new Error("No hover layer");
    expect(StyleSheet.flatten(layer.props.style)).toMatchObject({
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });
});
