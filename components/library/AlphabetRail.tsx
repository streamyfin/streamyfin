import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type GestureResponderEvent,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { CARD_LAYOUTS } from "@/components/cards/CardData";
import { Text } from "@/components/common/Text";
import {
  ALPHABET,
  letterAtIndex,
  letterAtOffset,
} from "@/utils/jellyfin/alphabetJump";

// The rail stands in the grid's side gutter, beside the artwork rather than
// on it.
const RAIL_WIDTH = CARD_LAYOUTS.portrait.contentInset;
const MAX_LETTER_HEIGHT = 18;
const MAX_FONT_SIZE = 11;
const BUBBLE_SIZE = 56;

interface Props {
  /** The letter the list is anchored at, if any. */
  active: string | null;
  onSelect: (letter: string) => void;
  /** Where the rail may stand: the screen edge it hugs and the bars it clears. */
  style?: StyleProp<ViewStyle>;
}

/**
 * The letter index down the side of a list sorted by name. Tap a letter, or
 * drag along the rail and let go on one.
 */
export const AlphabetRail: React.FC<Props> = ({ active, onSelect, style }) => {
  const { t } = useTranslation();
  const [height, setHeight] = useState(0);
  // The letter under the finger. It only reaches the list on release: every
  // letter crossed on the way would otherwise refetch the library.
  const [scrubbed, setScrubbed] = useState<string | null>(null);

  // Where the rail starts on the page, taken as a touch lands on it. Every
  // later offset is measured from there: `locationY` cannot be trusted past
  // the first event, because Android reports it against whichever view the
  // finger has since drifted onto.
  const railTop = useRef(0);

  const letterUnder = (event: GestureResponderEvent) =>
    letterAtOffset(event.nativeEvent.pageY - railTop.current, height);
  const track = (event: GestureResponderEvent) =>
    setScrubbed(letterUnder(event));

  const highlighted = scrubbed ?? active;
  // A short screen (a phone on its side) squeezes the letters, so they shrink
  // with their slot instead of running into each other.
  const fontSize = Math.min(
    MAX_FONT_SIZE,
    (height / ALPHABET.length) * 0.85 || MAX_FONT_SIZE,
  );

  return (
    <View
      pointerEvents='box-none'
      style={[
        { position: "absolute", width: RAIL_WIDTH, justifyContent: "center" },
        style,
      ]}
    >
      <View
        accessible
        accessibilityRole='adjustable'
        accessibilityLabel={t("library.jump_to_letter")}
        accessibilityValue={{ text: active ?? undefined }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={({ nativeEvent }) => {
          const step = nativeEvent.actionName === "increment" ? 1 : -1;
          onSelect(letterAtIndex(ALPHABET.indexOf(active ?? "") + step));
        }}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        onStartShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => {
          railTop.current =
            event.nativeEvent.pageY - event.nativeEvent.locationY;
          track(event);
        }}
        onResponderMove={track}
        onResponderRelease={(event) => {
          setScrubbed(null);
          onSelect(letterUnder(event));
        }}
        onResponderTerminate={() => setScrubbed(null)}
        style={{
          flexGrow: 1,
          maxHeight: ALPHABET.length * MAX_LETTER_HEIGHT,
        }}
      >
        {/* The letters take no touches of their own, so an offset is always
            measured from the top of the rail. */}
        <View pointerEvents='none' style={{ flex: 1 }}>
          {ALPHABET.map((letter) => (
            <View
              key={letter}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize,
                  fontWeight: letter === highlighted ? "800" : "500",
                  color: letter === highlighted ? "#fff" : "#a3a3a3",
                }}
              >
                {letter}
              </Text>
            </View>
          ))}
        </View>
      </View>
      {scrubbed && (
        <View
          pointerEvents='none'
          style={{
            position: "absolute",
            right: RAIL_WIDTH + 12,
            width: BUBBLE_SIZE,
            height: BUBBLE_SIZE,
            borderRadius: BUBBLE_SIZE / 2,
            backgroundColor: "rgba(38,38,38,0.95)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 28, fontWeight: "700" }}>{scrubbed}</Text>
        </View>
      )}
    </View>
  );
};
