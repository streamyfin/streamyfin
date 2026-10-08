import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import React, { useCallback, useImperativeHandle, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";

interface PinInputProps
  extends Omit<TextInputProps, "value" | "onChangeText" | "style"> {
  value: string;
  onChangeText: (text: string) => void;
  length?: number;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * In a bottom sheet the field has to be the sheet's own input, or the sheet
   * does not move with the keyboard; anywhere else that input throws.
   */
  inBottomSheet?: boolean;
}

export interface PinInputRef {
  focus: () => void;
}

const PinInputComponent = React.forwardRef<PinInputRef, PinInputProps>(
  (props, ref) => {
    const {
      value,
      onChangeText,
      length = 6,
      style,
      autoFocus,
      inBottomSheet = true,
      ...rest
    } = props;
    const Input = inBottomSheet ? BottomSheetTextInput : TextInput;

    const { t } = useTranslation();
    const inputRef = useRef<any>(null);
    const activeIndex = value.length;

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
        <Input
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          keyboardType='number-pad'
          // iOS has no return key on the number pad, so React Native adds a
          // toolbar whose button reads the return key type, "Default" in
          // English, unless it is given a label.
          inputAccessoryViewButtonLabel={t("common.ok")}
          maxLength={length}
          style={styles.hiddenInput}
          autoFocus={autoFocus}
          {...rest}
        />
        <View style={styles.cells} onTouchStart={handlePress}>
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
        </View>
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
