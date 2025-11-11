import { Button, ContextMenu, Host, Picker } from "@expo/ui/swift-ui";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { useGlobalModal } from "@/providers/GlobalModalProvider";

// Option types
export type RadioOption<T = any> = {
  type: "radio";
  label: string;
  value: T;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

export type ToggleOption = {
  type: "toggle";
  label: string;
  value: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

export type Option = RadioOption | ToggleOption;

// Option group structure
export type OptionGroup = {
  title?: string;
  options: Option[];
};

interface PlatformDropdownProps {
  trigger?: React.ReactNode;
  title?: string;
  groups: OptionGroup[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onOptionSelect?: (value?: any) => void;
  expoUIConfig?: {
    hostStyle?: any;
  };
  bottomSheetConfig?: {
    enableDynamicSizing?: boolean;
    enablePanDownToClose?: boolean;
  };
}

const ToggleSwitch: React.FC<{ value: boolean }> = ({ value }) => (
  <View
    className={`w-12 h-7 rounded-full ${value ? "bg-purple-600" : "bg-neutral-600"} flex-row items-center`}
  >
    <View
      className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
        value ? "translate-x-6" : "translate-x-1"
      }`}
    />
  </View>
);

const OptionItem: React.FC<{ option: Option; isLast?: boolean }> = ({
  option,
  isLast,
}) => {
  const isToggle = option.type === "toggle";
  const handlePress = isToggle ? option.onToggle : option.onPress;

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
        {isToggle ? (
          <ToggleSwitch value={option.value} />
        ) : option.selected ? (
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
};

const OptionGroupComponent: React.FC<{ group: OptionGroup }> = ({ group }) => (
  <View className='mb-6'>
    {group.title && (
      <Text className='text-lg font-semibold mb-3 text-neutral-300'>
        {group.title}
      </Text>
    )}
    <View
      style={{
        borderRadius: 12,
        overflow: "hidden",
      }}
      className='bg-neutral-800 rounded-xl overflow-hidden'
    >
      {group.options.map((option, index) => (
        <OptionItem
          key={index}
          option={option}
          isLast={index === group.options.length - 1}
        />
      ))}
    </View>
  </View>
);

const BottomSheetContent: React.FC<{
  title?: string;
  groups: OptionGroup[];
  onOptionSelect?: (value?: any) => void;
  onClose?: () => void;
}> = ({ title, groups, onOptionSelect, onClose }) => {
  const insets = useSafeAreaInsets();

  // Wrap the groups to call onOptionSelect when an option is pressed
  const wrappedGroups = groups.map((group) => ({
    ...group,
    options: group.options.map((option) => {
      if (option.type === "radio") {
        return {
          ...option,
          onPress: () => {
            option.onPress();
            onOptionSelect?.(option.value);
            onClose?.();
          },
        };
      }
      if (option.type === "toggle") {
        return {
          ...option,
          onToggle: () => {
            option.onToggle();
            onOptionSelect?.(option.value);
          },
        };
      }
      return option;
    }),
  }));

  return (
    <BottomSheetScrollView
      className='px-4 pb-8 pt-2'
      style={{
        paddingLeft: Math.max(16, insets.left),
        paddingRight: Math.max(16, insets.right),
      }}
    >
      {title && <Text className='font-bold text-2xl mb-6'>{title}</Text>}
      {wrappedGroups.map((group, index) => (
        <OptionGroupComponent key={index} group={group} />
      ))}
    </BottomSheetScrollView>
  );
};

const PlatformDropdownComponent = ({
  trigger,
  title,
  groups,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onOptionSelect,
  expoUIConfig,
  bottomSheetConfig,
}: PlatformDropdownProps) => {
  const { showModal, hideModal } = useGlobalModal();

  // Use internal state if not controlled externally
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const onOpenChange = controlledOnOpenChange ?? setInternalOpen;

  // Handle open/close state changes for Android
  useEffect(() => {
    if (Platform.OS === "android" && open === true) {
      showModal(
        <BottomSheetContent
          title={title}
          groups={groups}
          onOptionSelect={onOptionSelect}
          onClose={() => {
            hideModal();
            onOpenChange?.(false);
          }}
        />,
        {
          snapPoints: ["90%"],
          enablePanDownToClose: bottomSheetConfig?.enablePanDownToClose ?? true,
        },
      );
    }
  }, [
    open,
    title,
    groups,
    onOptionSelect,
    onOpenChange,
    bottomSheetConfig,
    showModal,
    hideModal,
  ]);

  if (Platform.OS === "ios") {
    return (
      <Host style={expoUIConfig?.hostStyle}>
        <ContextMenu>
          <ContextMenu.Trigger>
            <View className=''>
              {trigger || <Button variant='bordered'>Show Menu</Button>}
            </View>
          </ContextMenu.Trigger>
          <ContextMenu.Items>
            {groups.flatMap((group, groupIndex) => {
              // Check if this group has radio options
              const radioOptions = group.options.filter(
                (opt) => opt.type === "radio",
              ) as RadioOption[];
              const toggleOptions = group.options.filter(
                (opt) => opt.type === "toggle",
              ) as ToggleOption[];

              const items = [];

              // Add Picker for radio options ONLY if there's a group title
              // Otherwise render as individual buttons
              if (radioOptions.length > 0) {
                if (group.title) {
                  // Use Picker for grouped options
                  items.push(
                    <Picker
                      key={`picker-${groupIndex}`}
                      label={group.title}
                      options={radioOptions.map((opt) => opt.label)}
                      variant='menu'
                      selectedIndex={radioOptions.findIndex(
                        (opt) => opt.selected,
                      )}
                      onOptionSelected={(event: any) => {
                        const index = event.nativeEvent.index;
                        const selectedOption = radioOptions[index];
                        selectedOption?.onPress();
                        onOptionSelect?.(selectedOption?.value);
                      }}
                    />,
                  );
                } else {
                  // Render radio options as direct buttons
                  radioOptions.forEach((option, optionIndex) => {
                    items.push(
                      <Button
                        key={`radio-${groupIndex}-${optionIndex}`}
                        systemImage={
                          option.selected ? "checkmark.circle.fill" : "circle"
                        }
                        onPress={() => {
                          option.onPress();
                          onOptionSelect?.(option.value);
                        }}
                        disabled={option.disabled}
                      >
                        {option.label}
                      </Button>,
                    );
                  });
                }
              }

              // Add Buttons for toggle options
              toggleOptions.forEach((option, optionIndex) => {
                items.push(
                  <Button
                    key={`toggle-${groupIndex}-${optionIndex}`}
                    systemImage={
                      option.value ? "checkmark.circle.fill" : "circle"
                    }
                    onPress={() => {
                      option.onToggle();
                      onOptionSelect?.(option.value);
                    }}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </Button>,
                );
              });

              return items;
            })}
          </ContextMenu.Items>
        </ContextMenu>
      </Host>
    );
  }

  // Android: Wrap trigger in TouchableOpacity to handle press events
  // The useEffect above watches for open state changes and shows/hides the modal
  return (
    <TouchableOpacity onPress={() => onOpenChange(true)} activeOpacity={0.7}>
      {trigger || <Text className='text-white'>Open Menu</Text>}
    </TouchableOpacity>
  );
};

// Memoize to prevent unnecessary re-renders when parent re-renders
export const PlatformDropdown = React.memo(
  PlatformDropdownComponent,
  (prevProps, nextProps) => {
    // Custom comparison - only re-render if these props actually change
    return (
      prevProps.title === nextProps.title &&
      prevProps.open === nextProps.open &&
      prevProps.groups === nextProps.groups && // Reference equality (works because we memoize groups in caller)
      prevProps.trigger === nextProps.trigger // Reference equality
    );
  },
);
