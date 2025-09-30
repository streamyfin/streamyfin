import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import {
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";

// Conditional import for Expo UI (iOS only)
let ContextMenu: any = null;
let Host: any = null;
let Button: any = null;
let Picker: any = null;

if (!Platform.isTV && Platform.OS === "ios") {
  try {
    const ExpoUI = require("@expo/ui/swift-ui");
    ContextMenu = ExpoUI.ContextMenu;
    Host = ExpoUI.Host;
    Button = ExpoUI.Button;
    Picker = ExpoUI.Picker;
  } catch {
    console.warn(
      "Expo UI not available, falling back to Android implementation",
    );
  }
}

// Core option types
export type OptionType =
  | "radio"
  | "checkbox"
  | "toggle"
  | "action"
  | "separator";

// Base option interface
export interface BaseOption {
  id: string;
  type: OptionType;
  label: string;
  disabled?: boolean;
  hidden?: boolean;
}

// Specific option types
export interface RadioOption extends BaseOption {
  type: "radio";
  groupId: string; // For grouping radio buttons
  selected?: boolean;
}

export interface CheckboxOption extends BaseOption {
  type: "checkbox";
  checked: boolean;
}

export interface ToggleOption extends BaseOption {
  type: "toggle";
  value: boolean;
}

export interface ActionOption extends BaseOption {
  type: "action";
  icon?: string; // Ionicons name
}

export interface SeparatorOption extends BaseOption {
  type: "separator";
  label: ""; // Separator doesn't need a label
}

// Union type for all options
export type Option =
  | RadioOption
  | CheckboxOption
  | ToggleOption
  | ActionOption
  | SeparatorOption;

// Option groups
export interface OptionGroup {
  id: string;
  title: string;
  options: Option[];
}

// Component props interface
export interface PlatformOptionsMenuProps extends ViewProps {
  // Data
  groups: OptionGroup[];

  // Presentation
  trigger: React.ReactNode; // Custom trigger button
  title: string;

  // Behavior
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOptionSelect: (optionId: string, value?: any) => void;

  // Platform specific configurations
  expoUIConfig?: {
    hostStyle?: ViewProps["style"];
  };

  bottomSheetConfig?: {
    snapPoints?: string[];
    enableDynamicSizing?: boolean;
    enablePanDownToClose?: boolean;
  };
}

// Helper component for Android bottom sheet option rendering
const AndroidOptionItem: React.FC<{
  option: Option;
  onSelect: (optionId: string, value?: any) => void;
  isLast?: boolean;
}> = ({ option, onSelect, isLast }) => {
  if (option.hidden) return null;

  if (option.type === "separator") {
    return (
      <View
        style={{
          height: StyleSheet.hairlineWidth,
          marginVertical: 8,
        }}
        className='bg-neutral-700 mx-4'
      />
    );
  }

  const handlePress = () => {
    if (option.disabled) return;

    switch (option.type) {
      case "radio":
        onSelect(option.id, !option.selected);
        break;
      case "checkbox":
        onSelect(option.id, !option.checked);
        break;
      case "toggle":
        onSelect(option.id, !option.value);
        break;
      case "action":
        onSelect(option.id);
        break;
    }
  };

  const renderIcon = () => {
    switch (option.type) {
      case "radio":
        return (
          <Ionicons
            name={option.selected ? "radio-button-on" : "radio-button-off"}
            size={24}
            color={option.selected ? "#9333ea" : "#6b7280"}
          />
        );
      case "checkbox":
        return (
          <Ionicons
            name={option.checked ? "checkmark-circle" : "ellipse-outline"}
            size={24}
            color={option.checked ? "#9333ea" : "#6b7280"}
          />
        );
      case "toggle":
        return (
          <View
            className={`w-12 h-7 rounded-full ${
              option.value ? "bg-purple-600" : "bg-neutral-600"
            } flex-row items-center`}
          >
            <View
              className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                option.value ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </View>
        );
      case "action":
        return option.icon ? (
          <Ionicons name={option.icon as any} size={24} color='white' />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        disabled={option.disabled}
        className={`px-4 py-3 flex flex-row items-center justify-between ${
          option.disabled ? "opacity-50" : ""
        }`}
      >
        <Text className='flex-1 text-white'>{option.label}</Text>
        {renderIcon()}
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
};

// Helper component for Android bottom sheet group rendering
const AndroidOptionGroup: React.FC<{
  group: OptionGroup;
  onSelect: (optionId: string, value?: any) => void;
  isLast?: boolean;
}> = ({ group, onSelect, isLast }) => {
  const visibleOptions = group.options.filter((option) => !option.hidden);

  if (visibleOptions.length === 0) return null;

  return (
    <View className={isLast ? "mb-0" : "mb-6"}>
      <Text className='text-lg font-semibold mb-3 text-neutral-300'>
        {group.title}
      </Text>
      <View
        style={{
          borderRadius: 12,
          overflow: "hidden",
        }}
        className='bg-neutral-800 rounded-xl overflow-hidden'
      >
        {visibleOptions.map((option, index) => (
          <AndroidOptionItem
            key={option.id}
            option={option}
            onSelect={onSelect}
            isLast={index === visibleOptions.length - 1}
          />
        ))}
      </View>
    </View>
  );
};

/**
 * PlatformOptionsMenu Component
 *
 * A unified component that renders platform-appropriate option menus:
 * - iOS: Expo UI ContextMenu with native SwiftUI integration
 * - Android: Bottom sheet modal
 *
 * Supports radio buttons, checkboxes, toggles, actions, and separators.
 */
export const PlatformOptionsMenu: React.FC<PlatformOptionsMenuProps> = ({
  groups,
  trigger,
  title,
  open,
  onOpenChange,
  onOptionSelect,
  expoUIConfig,
  bottomSheetConfig,
  ...viewProps
}) => {
  const isIOS = Platform.OS === "ios";
  const isTv = Platform.isTV;
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);
  const insets = useSafeAreaInsets();

  // Bottom sheet effects
  useEffect(() => {
    if (!isIOS) {
      if (open) bottomSheetModalRef.current?.present();
      else bottomSheetModalRef.current?.dismiss();
    }
  }, [open, isIOS]);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1) {
        onOpenChange(false);
      }
    },
    [onOpenChange],
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

  if (isTv) return null;

  // iOS Implementation with Expo UI ContextMenu
  if (isIOS && ContextMenu && Host && Button) {
    const renderContextMenuItems = () => {
      const items: React.ReactNode[] = [];

      groups.forEach((group) => {
        // Add group items
        group.options.forEach((option) => {
          if (option.hidden) return;

          if (option.type === "separator") {
            return;
          }

          if (option.type === "radio") {
            // For radio options, create a picker if multiple options in the same group
            const groupOptions = groups
              .flatMap((g) => g.options)
              .filter(
                (opt) =>
                  opt.type === "radio" &&
                  (opt as RadioOption).groupId ===
                    (option as RadioOption).groupId,
              );

            if (groupOptions.length > 1) {
              // Create a picker for radio group
              const selectedIndex = groupOptions.findIndex(
                (opt) => (opt as RadioOption).selected,
              );
              const pickerOptions = groupOptions.map((opt) => opt.label);

              items.push(
                <Picker
                  key={`${(option as RadioOption).groupId}-picker`}
                  label={group.title}
                  options={pickerOptions}
                  variant='menu'
                  selectedIndex={Math.max(0, selectedIndex)}
                  onOptionSelected={({ nativeEvent: { index } }: any) => {
                    const selectedOption = groupOptions[index];
                    if (selectedOption) {
                      onOptionSelect(selectedOption.id, true);
                    }
                  }}
                />,
              );
              return; // Skip individual radio buttons when we have a picker
            }
          }

          // For other option types, create buttons
          const systemImage =
            option.type === "action" && (option as ActionOption).icon
              ? (option as ActionOption).icon
              : undefined;

          const variant = (() => {
            if (option.type === "checkbox") {
              return (option as CheckboxOption).checked ? "filled" : "bordered";
            }
            if (option.type === "toggle") {
              return (option as ToggleOption).value ? "filled" : "bordered";
            }
            return "bordered";
          })();

          items.push(
            <Button
              key={option.id}
              systemImage={systemImage}
              variant={variant}
              onPress={() => {
                switch (option.type) {
                  case "checkbox":
                    onOptionSelect(
                      option.id,
                      !(option as CheckboxOption).checked,
                    );
                    break;
                  case "toggle":
                    onOptionSelect(option.id, !(option as ToggleOption).value);
                    break;
                  case "radio":
                    onOptionSelect(
                      option.id,
                      !(option as RadioOption).selected,
                    );
                    break;
                  case "action":
                    onOptionSelect(option.id);
                    break;
                }
              }}
              disabled={option.disabled}
            >
              {option.label}
            </Button>,
          );
        });
      });

      return items;
    };

    return (
      <View {...viewProps}>
        <Host style={expoUIConfig?.hostStyle || { flex: 1 }}>
          <ContextMenu>
            <ContextMenu.Items>{renderContextMenuItems()}</ContextMenu.Items>
            <ContextMenu.Trigger>{trigger}</ContextMenu.Trigger>
          </ContextMenu>
        </Host>
      </View>
    );
  }

  // Android Implementation with Bottom Sheet
  return (
    <View {...viewProps}>
      <BottomSheetModal
        ref={bottomSheetModalRef}
        enableDynamicSizing={bottomSheetConfig?.enableDynamicSizing ?? true}
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
        enablePanDownToClose={bottomSheetConfig?.enablePanDownToClose ?? true}
        enableDismissOnClose
        snapPoints={bottomSheetConfig?.snapPoints}
      >
        <BottomSheetView>
          <View
            className='px-4 pb-8 pt-2'
            style={{
              paddingLeft: Math.max(16, insets.left),
              paddingRight: Math.max(16, insets.right),
            }}
          >
            <Text className='font-bold text-2xl mb-6'>{title}</Text>

            {groups.map((group, index) => (
              <AndroidOptionGroup
                key={group.id}
                group={group}
                onSelect={onOptionSelect}
                isLast={index === groups.length - 1}
              />
            ))}
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
};
