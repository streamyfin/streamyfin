import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import React, { useCallback, useId, useImperativeHandle, useRef } from "react";
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import { NO_KEYBOARD_TOOLBAR } from "@/constants/Keyboard";

interface PinInputProps
  extends Omit<TextInputProps, "value" | "onChangeText" | "style"> {
  value: string;
  onChangeText: (text: string) => void;
  length?: number;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}

export interface PinInputRef {
  focus: () => void;
}

/**
 * Six cells over a hidden number field, for a PIN or a Quick Connect code.
 *
 * iOS shows no toolbar above its number pad, so the screen around it has to
 * offer a way out of the keyboard: a button kept above it, or a
 * DismissKeyboardArea.
 */
const PinInputComponent = React.forwardRef<PinInputRef, PinInputProps>(
  (props, ref) => {
    const {
      value,
      onChangeText,
      length = 6,
      style,
      autoFocus,
      ...rest
    } = props;

    const inputRef = useRef<any>(null);
    const activeIndex = value.length;
    // A new id on each mount. Fabric reuses a text input's native view and
    // diffs the new props against the ones that view had: its reuse clears
    // the id, so the same id again would never be set back.
    const instanceId = useId();
    const toolbarId = `${NO_KEYBOARD_TOOLBAR}-${instanceId}`;

    const handlePress = useCallback(() => {
      inputRef.current?.focus();
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => inputRef.current?.focus(),
      }),
      [],
    );

    return (
      <View style={[styles.container, style]}>
        <BottomSheetTextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          keyboardType='number-pad'
          // react-native-tvos adds a toolbar with a "Default" button above
          // every iOS number pad, which upstream React Native and native apps
          // do not have. The sheets around this input keep their buttons above
          // the keyboard, and a tap beside the field closes it.
          inputAccessoryViewID={toolbarId}
          maxLength={length}
          style={styles.hiddenInput}
          autoFocus={autoFocus}
          {...rest}
        />
        {/* A press of its own, so a tap that opens the keyboard does not
            also reach an area that closes it. */}
        <Pressable
          accessible={false}
          style={styles.cells}
          onPress={handlePress}
        >
          {Array(length)
            .fill(0)
            .map((_, i) => (
              <View
                key={i}
                style={[
                  styles.cell,
                  i === activeIndex && styles.activeCell,
                  i === activeIndex - 1 && styles.filledCell,
                ]}
              >
                <Text style={styles.digit}>{value[i]}</Text>
                {i === activeIndex && <View style={styles.cursor} />}
              </View>
            ))}
        </Pressable>
      </View>
    );
  },
);

PinInputComponent.displayName = "PinInput";

export const PinInput = PinInputComponent;

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  hiddenInput: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  cells: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  cell: {
    width: 40,
    height: 48,
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1F2937",
  },
  activeCell: {
    borderColor: "#6366F1",
  },
  filledCell: {
    borderColor: "#4B5563",
  },
  digit: {
    fontSize: 24,
    color: "white",
    fontWeight: "500",
  },
  cursor: {
    position: "absolute",
    width: 2,
    height: 24,
    backgroundColor: "#6366F1",
  },
});
