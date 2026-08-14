import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Keyboard, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import {
  type CustomHeader,
  HEADER_PRESETS,
  type HeaderPreset,
  presetRows,
} from "@/utils/customHeaders";
import { CustomHeaderList } from "./CustomHeaderList";

interface CustomHeaderSheetProps {
  /** The sheet owns its rows from here on — GlobalModal snapshots content. */
  initialHeaders: CustomHeader[];
  /** Mirrors every edit back to the owner, so a swipe-to-dismiss keeps them. */
  onChange?: (headers: CustomHeader[]) => void;
  /**
   * Persist the final rows, once. Fired when the sheet goes away — by the
   * button or by a swipe — so a saved server isn't rewritten (Keychain, and
   * every cached header with it) on each keystroke.
   */
  onCommit?: (headers: CustomHeader[]) => void;
  onClose: () => void;
}

/**
 * Bottom-sheet editor for the custom proxy auth headers, used from the login
 * screen where there is no settings page to put them on.
 *
 * Presets are a second view inside the same sheet rather than another modal:
 * GlobalModal holds one sheet at a time, so replacing its content would lose
 * the rows the user has already typed.
 */
export function CustomHeaderSheet({
  initialHeaders,
  onChange,
  onCommit,
  onClose,
}: CustomHeaderSheetProps): React.ReactElement {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [headers, setHeaders] = useState<CustomHeader[]>(initialHeaders);
  const [showPresets, setShowPresets] = useState(false);

  // The app draws edge to edge, so Android never resizes the window for the
  // keyboard and `adjustResize` does nothing: the sheet keeps its height and
  // the lower fields sit under the keyboard with nothing to scroll to. Padding
  // the scroll content by the keyboard's height gives them somewhere to go.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", (event) =>
      setKeyboardHeight(event.endCoordinates.height),
    );
    const hidden = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardHeight(0),
    );

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  // Read on the way out, so the commit sees the last edit rather than the rows
  // captured when the effect was set up.
  const latestHeaders = useRef(initialHeaders);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(
    () => () => {
      commitRef.current?.(latestHeaders.current);
    },
    [],
  );

  const update = (next: CustomHeader[]) => {
    latestHeaders.current = next;
    setHeaders(next);
    onChange?.(next);
  };

  const applyPreset = (preset: HeaderPreset) => {
    update([...headers, ...presetRows(preset)]);
    setShowPresets(false);
  };

  return (
    <BottomSheetScrollView
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: insets.bottom + 16 + keyboardHeight,
        gap: 12,
      }}
    >
      {showPresets ? (
        <>
          <View className='flex-row items-center gap-x-2'>
            <TouchableOpacity
              onPress={() => setShowPresets(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name='chevron-back' size={22} color='white' />
            </TouchableOpacity>
            <Text className='text-lg font-bold'>
              {t("custom_headers.presets_title")}
            </Text>
          </View>

          {HEADER_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.id}
              onPress={() => applyPreset(preset)}
              className='bg-neutral-900 border border-neutral-700 rounded-xl p-4 flex-row items-center justify-between'
            >
              <View className='flex-1 pr-3'>
                <Text className='font-semibold'>{preset.label}</Text>
                <Text className='text-xs text-neutral-400 mt-0.5'>
                  {preset.description}
                </Text>
              </View>
              <Ionicons name='add-circle' size={22} color='#9333EA' />
            </TouchableOpacity>
          ))}
        </>
      ) : (
        <>
          <Text className='text-lg font-bold'>{t("custom_headers.title")}</Text>
          <Text className='text-xs text-neutral-400 -mt-2'>
            {t("custom_headers.description")}
          </Text>

          <CustomHeaderList
            headers={headers}
            onChange={update}
            onCommit={update}
            onAddPreset={() => setShowPresets(true)}
          />

          <Text className='text-xs text-neutral-500'>
            {t("custom_headers.security_note")}
          </Text>

          <Button onPress={onClose}>{t("custom_headers.done")}</Button>
        </>
      )}
    </BottomSheetScrollView>
  );
}
