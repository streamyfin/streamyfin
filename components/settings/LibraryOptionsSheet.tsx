import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  StyleSheet,
  TouchableOpacity,
  View,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";

interface LibraryOptions {
  display: "row" | "list";
  imageStyle: "poster" | "cover";
  showTitles: boolean;
  showStats: boolean;
}

interface Props extends ViewProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  settings: LibraryOptions;
  updateSettings: (options: Partial<LibraryOptions>) => void;
  disabled?: boolean;
}

const OptionGroup: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View className='mb-6'>
    <Text className='text-lg font-semibold mb-3 text-neutral-300'>{title}</Text>
    <View
      style={{
        borderRadius: 12,
        overflow: "hidden",
      }}
      className='bg-neutral-800 rounded-xl overflow-hidden'
    >
      {children}
    </View>
  </View>
);

const OptionItem: React.FC<{
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  isLast?: boolean;
}> = ({ label, selected, onPress, disabled: itemDisabled, isLast }) => (
  <>
    <TouchableOpacity
      onPress={onPress}
      disabled={itemDisabled}
      className={`px-4 py-3 flex flex-row items-center justify-between ${
        itemDisabled ? "opacity-50" : ""
      }`}
    >
      <Text className='flex-1 text-white'>{label}</Text>
      {selected ? (
        <Ionicons name='checkmark-circle' size={24} color='#9333ea' />
      ) : (
        <Ionicons name='ellipse-outline' size={24} color='#6b7280' />
      )}
    </TouchableOpacity>
    {!isLast && (
      <View
        style={{
          height: StyleSheet.hairlineWidth,
        }}
        className='bg-neutral-700 mx-4'
      />
    )}
  </>
);

const ToggleItem: React.FC<{
  label: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
  isLast?: boolean;
}> = ({ label, value, onToggle, disabled: itemDisabled, isLast }) => (
  <>
    <TouchableOpacity
      onPress={onToggle}
      disabled={itemDisabled}
      className={`px-4 py-3 flex flex-row items-center justify-between ${
        itemDisabled ? "opacity-50" : ""
      }`}
    >
      <Text className='flex-1 text-white'>{label}</Text>
      <View
        className={`w-12 h-7 rounded-full ${value ? "bg-purple-600" : "bg-neutral-600"} flex-row items-center`}
      >
        <View
          className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </View>
    </TouchableOpacity>
    {!isLast && (
      <View
        style={{
          height: StyleSheet.hairlineWidth,
        }}
        className='bg-neutral-700 mx-4'
      />
    )}
  </>
);

/**
 * LibraryOptionsSheet Component
 *
 * This component creates a bottom sheet modal for managing library display options.
 */
export const LibraryOptionsSheet: React.FC<Props> = ({
  open,
  setOpen,
  settings,
  updateSettings,
  disabled = false,
}) => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const handlePresentModal = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleDismissModal = useCallback(() => {
    bottomSheetModalRef.current?.dismiss();
  }, []);

  useEffect(() => {
    if (open) {
      handlePresentModal();
    } else {
      handleDismissModal();
    }
  }, [open, handlePresentModal, handleDismissModal]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        setOpen(false);
      }
    },
    [setOpen],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [],
  );

  if (disabled) return null;

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      enableDynamicSizing
      onChange={handleSheetChanges}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{
        backgroundColor: "white",
      }}
      backgroundStyle={{
        backgroundColor: "#171717",
      }}
      enablePanDownToClose
      enableDismissOnClose
    >
      <BottomSheetView>
        <View
          className='px-4 pb-8 pt-2'
          style={{
            paddingLeft: Math.max(16, insets.left),
            paddingRight: Math.max(16, insets.right),
          }}
        >
          <Text className='font-bold text-2xl mb-6'>
            {t("library.options.display")}
          </Text>

          <OptionGroup title={t("library.options.display")}>
            <OptionItem
              label={t("library.options.row")}
              selected={settings.display === "row"}
              onPress={() => updateSettings({ display: "row" })}
            />
            <OptionItem
              label={t("library.options.list")}
              selected={settings.display === "list"}
              onPress={() => updateSettings({ display: "list" })}
              isLast
            />
          </OptionGroup>

          <OptionGroup title={t("library.options.image_style")}>
            <OptionItem
              label={t("library.options.poster")}
              selected={settings.imageStyle === "poster"}
              onPress={() => updateSettings({ imageStyle: "poster" })}
            />
            <OptionItem
              label={t("library.options.cover")}
              selected={settings.imageStyle === "cover"}
              onPress={() => updateSettings({ imageStyle: "cover" })}
              isLast
            />
          </OptionGroup>

          <OptionGroup title='Options'>
            <ToggleItem
              label={t("library.options.show_titles")}
              value={settings.showTitles}
              onToggle={() =>
                updateSettings({ showTitles: !settings.showTitles })
              }
              disabled={settings.imageStyle === "poster"}
            />
            <ToggleItem
              label={t("library.options.show_stats")}
              value={settings.showStats}
              onToggle={() =>
                updateSettings({ showStats: !settings.showStats })
              }
              isLast
            />
          </OptionGroup>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
};
