import { Ionicons } from "@expo/vector-icons";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import React, { useEffect, useState } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MeasuredTriggerHost,
  OptionGroupCard,
  ToggleSwitch,
} from "@/components/common/dropdownShared";
import { Text } from "@/components/common/Text";
import type {
  ActionOption as BaseActionOption,
  RadioOption as BaseRadioOption,
  ToggleOption as BaseToggleOption,
} from "@/components/PlatformDropdown";
import { useGlobalModal } from "@/providers/GlobalModalProvider";

// Player-only popover/sheet. Shares no rendering with `PlatformDropdown`:
// that component is used by ~20 callers (settings, season pickers,
// bitrate/audio/subtitle selectors, …) and must keep its small native
// Menu look. This one targets the in-player `...` button and is allowed to
// (a) host a real slider, (b) wear the Swift-mock visual style, and
// (c) carry SF Symbol icons per row.
//
// Common boilerplate (trigger measurement, ToggleSwitch, Android option-card
// shell) lives in @/components/common/dropdownShared and is reused with
// PlatformDropdown.
//
// @expo/ui's SwiftUI native module (ExpoUI) does not exist in tvOS builds.
// A static top-level import evaluates requireNativeModule('ExpoUI') at module
// load and crashes the entire route tree on tvOS (expo-router requires every
// route file). Load it lazily and only off-TV; TV never renders these.
const {
  Button,
  HStack,
  Image: SwiftImage,
  Menu,
  Popover,
  Rectangle: SwiftRectangle,
  Slider: SwiftSlider,
  Spacer,
  Stepper,
  Text: SwiftText,
  Toggle: SwiftToggle,
  VStack,
} = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui"))
  : require("@expo/ui/swift-ui");
const {
  buttonStyle,
  disabled,
  font,
  foregroundStyle,
  frame,
  opacity,
  padding,
  tint,
} = Platform.isTV
  ? ({} as typeof import("@expo/ui/swift-ui/modifiers"))
  : require("@expo/ui/swift-ui/modifiers");
// Android-side Material 3 slider. Lives in @expo/ui/community/slider and is a
// drop-in for react-native-community/slider on Android (and SwiftUI Slider on
// iOS, but we use the swift-ui Slider directly inside the popover instead).
const { Slider: CommunitySlider } = Platform.isTV
  ? ({} as typeof import("@expo/ui/community/slider"))
  : require("@expo/ui/community/slider");

// ---------------------------------------------------------------------------
// Option model
// ---------------------------------------------------------------------------
// Reuses PlatformDropdown's three base option types (so the 20+ shared callers
// and the player popover stay in sync on shape), then adds:
//   - `icon?: string` on every variant — SF Symbol shown in the iOS popover
//   - Slider / Stepper / Subgroup variants for the player's extra controls

type WithIcon = { icon?: string };

export type RadioOption<T = any> = BaseRadioOption<T> & WithIcon;
export type ToggleOption = BaseToggleOption & WithIcon;
export type ActionOption = BaseActionOption & WithIcon;

export type StepperOption = {
  type: "stepper";
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
  /** Optional value formatter for the displayed number. */
  format?: (value: number) => string;
  disabled?: boolean;
} & WithIcon;

export type SliderOption = {
  type: "slider";
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onValueChange: (value: number) => void;
  /** Optional value formatter for the displayed number. */
  format?: (value: number) => string;
  disabled?: boolean;
} & WithIcon;

/**
 * A row that itself opens a nested dropdown. On iOS this renders as a
 * SwiftUI `Menu` inside the popover (label = subgroup name, value =
 * currently-selected child); on Android the row expands inline to show its
 * options when tapped (and collapses again on a second tap).
 */
export type SubgroupOption = {
  type: "subgroup";
  label: string;
  options: Option[];
  disabled?: boolean;
} & WithIcon;

export type Option =
  | RadioOption
  | ToggleOption
  | ActionOption
  | StepperOption
  | SliderOption
  | SubgroupOption;

export type OptionGroup = {
  title?: string;
  options: Option[];
  /**
   * Optional SF Symbol used for the group's row in the iOS popover when the
   * entire group is compressed to a single Menu (e.g. radio-only groups).
   */
  icon?: string;
};

interface PlayerSettingsPopoverProps {
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

// ---------------------------------------------------------------------------
// Android bottom-sheet renderers
// ---------------------------------------------------------------------------

const StepperControl: React.FC<{
  option: StepperOption;
}> = ({ option }) => {
  const display = option.format
    ? option.format(option.value)
    : option.value.toString();
  const canDecrement = option.value > option.min;
  const canIncrement = option.value < option.max;

  const decrement = () => {
    if (option.disabled) return;
    const next = Math.max(option.min, option.value - option.step);
    if (next !== option.value) option.onValueChange(next);
  };
  const increment = () => {
    if (option.disabled) return;
    const next = Math.min(option.max, option.value + option.step);
    if (next !== option.value) option.onValueChange(next);
  };

  return (
    <View className='flex flex-row items-center'>
      <TouchableOpacity
        onPress={decrement}
        disabled={!canDecrement || option.disabled}
        className={`w-8 h-8 bg-neutral-700 rounded-l-lg flex items-center justify-center ${!canDecrement || option.disabled ? "opacity-40" : ""}`}
      >
        <Text className='text-white'>-</Text>
      </TouchableOpacity>
      <View className='h-8 px-3 bg-neutral-700 flex items-center justify-center'>
        <Text className='text-white'>{display}</Text>
      </View>
      <TouchableOpacity
        onPress={increment}
        disabled={!canIncrement || option.disabled}
        className={`w-8 h-8 bg-neutral-700 rounded-r-lg flex items-center justify-center ${!canIncrement || option.disabled ? "opacity-40" : ""}`}
      >
        <Text className='text-white'>+</Text>
      </TouchableOpacity>
    </View>
  );
};

/**
 * Android: full-width Material 3 slider inside the bottom sheet, with a
 * label/value row above the track. The slider lives below the touch target so
 * dragging it doesn't accidentally collapse the sheet.
 */
const SliderControl: React.FC<{
  option: SliderOption;
}> = ({ option }) => {
  const display = option.format
    ? option.format(option.value)
    : option.value.toString();
  return (
    <View className='flex-1 px-4 py-3'>
      <View className='flex flex-row items-center justify-between mb-2'>
        <Text className='text-white'>{option.label}</Text>
        <Text className='text-neutral-400'>{display}</Text>
      </View>
      <CommunitySlider
        value={option.value}
        minimumValue={option.min}
        maximumValue={option.max}
        step={option.step}
        onValueChange={option.onValueChange}
        disabled={option.disabled}
        style={{ width: "100%", height: 40 }}
      />
    </View>
  );
};

const OptionItem: React.FC<{ option: Option; isLast?: boolean }> = ({
  option,
  isLast,
}) => {
  const [expanded, setExpanded] = useState(false);

  const isToggle = option.type === "toggle";
  const isAction = option.type === "action";
  const isStepper = option.type === "stepper";
  const isSlider = option.type === "slider";
  const isSubgroup = option.type === "subgroup";

  if (isSlider) {
    return (
      <>
        <SliderControl option={option} />
        {!isLast && (
          <View
            style={{ height: StyleSheet.hairlineWidth }}
            className='bg-neutral-700 mx-4'
          />
        )}
      </>
    );
  }

  const handlePress = isToggle
    ? option.onToggle
    : isSubgroup
      ? () => setExpanded((v) => !v)
      : isStepper
        ? undefined
        : (option as RadioOption | ActionOption).onPress;

  const selectedChild = isSubgroup
    ? (option.options.find(
        (o): o is RadioOption => o.type === "radio" && o.selected,
      ) ?? undefined)
    : undefined;

  return (
    <>
      <TouchableOpacity
        onPress={handlePress}
        disabled={option.disabled || isStepper}
        activeOpacity={isStepper ? 1 : 0.2}
        className={`px-4 py-3 flex flex-row items-center justify-between ${option.disabled ? "opacity-50" : ""}`}
      >
        <Text className='flex-1 text-white'>{option.label}</Text>
        {isToggle ? (
          <ToggleSwitch value={option.value} />
        ) : isStepper ? (
          <StepperControl option={option} />
        ) : isSubgroup ? (
          <View className='flex flex-row items-center'>
            {selectedChild && (
              <Text className='text-neutral-400 mr-2'>
                {selectedChild.label}
              </Text>
            )}
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={20}
              color='#9ca3af'
            />
          </View>
        ) : isAction ? null : (option as RadioOption).selected ? (
          <Ionicons name='checkmark-circle' size={24} color='#9333ea' />
        ) : (
          <Ionicons name='ellipse-outline' size={24} color='#6b7280' />
        )}
      </TouchableOpacity>

      {isSubgroup && expanded && (
        <View className='pl-4 bg-neutral-900'>
          {option.options.map((child, childIndex) => (
            <OptionItem
              key={childIndex}
              option={child}
              isLast={childIndex === option.options.length - 1}
            />
          ))}
        </View>
      )}

      {!isLast && (
        <View
          style={{ height: StyleSheet.hairlineWidth }}
          className='bg-neutral-700 mx-4'
        />
      )}
    </>
  );
};

const OptionGroupComponent: React.FC<{ group: OptionGroup }> = ({ group }) => (
  <OptionGroupCard title={group.title}>
    {group.options.map((option, index) => (
      <OptionItem
        key={index}
        option={option}
        isLast={index === group.options.length - 1}
      />
    ))}
  </OptionGroupCard>
);

const BottomSheetContent: React.FC<{
  title?: string;
  groups: OptionGroup[];
  onOptionSelect?: (value?: any) => void;
  onClose?: () => void;
}> = ({ title, groups, onOptionSelect, onClose }) => {
  const insets = useSafeAreaInsets();

  // Recursively wrap options so radio/action presses also call
  // onOptionSelect/onClose, including options nested inside subgroups.
  const wrapOption = (option: Option): Option => {
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
    if (option.type === "action") {
      return {
        ...option,
        onPress: () => {
          option.onPress();
          onClose?.();
        },
      };
    }
    if (option.type === "subgroup") {
      return { ...option, options: option.options.map(wrapOption) };
    }
    return option;
  };

  const wrappedGroups = groups.map((group) => ({
    ...group,
    options: group.options.map(wrapOption),
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PlayerSettingsPopoverComponent = ({
  trigger,
  title,
  groups,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  onOptionSelect,
  expoUIConfig,
  bottomSheetConfig,
}: PlayerSettingsPopoverProps) => {
  const { showModal, hideModal, isVisible } = useGlobalModal();

  // Android: controlled open routes through the global bottom-sheet modal.
  useEffect(() => {
    if (Platform.OS === "android" && controlledOpen === true) {
      showModal(
        <BottomSheetContent
          title={title}
          groups={groups}
          onOptionSelect={onOptionSelect}
          onClose={() => {
            hideModal();
            controlledOnOpenChange?.(false);
          }}
        />,
        {
          snapPoints: ["90%"],
          enablePanDownToClose: bottomSheetConfig?.enablePanDownToClose ?? true,
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledOpen]);

  useEffect(() => {
    if (Platform.OS === "android" && controlledOpen === true && !isVisible) {
      controlledOnOpenChange?.(false);
    }
  }, [isVisible, controlledOpen, controlledOnOpenChange]);

  // Internal open state for the iOS popover. Synced both ways with
  // `controlledOpen` when controlled.
  const [iosOpen, setIosOpen] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios" && controlledOpen !== undefined) {
      setIosOpen(controlledOpen);
    }
  }, [controlledOpen]);

  const handleIosOpenChange = (value: boolean) => {
    setIosOpen(value);
    controlledOnOpenChange?.(value);
  };

  if (Platform.OS === "ios" && !Platform.isTV) {
    const closePopover = () => handleIosOpenChange(false);

    // ---- Swift-mock styled popover body ----
    // Mirrors the reference Swift `PlayerSettingsViewController` design:
    //   - small-caps section headers with a hairline rule to the trailing edge
    //   - 44pt rows with leading SF Symbol, 15pt title, trailing value + glyph
    //   - real native Slider rows for slider options
    // Radio-only titled groups (Quality/Audio/Speed) are compressed to a
    // single Menu row whose label is a styled HStack — tapping opens the
    // selection menu without changing the panel's height.

    type IconName = string | undefined;

    const MENU_CHEVRON = "chevron.up.chevron.down" as const;
    const TERTIARY = {
      type: "hierarchical" as const,
      style: "tertiary" as const,
    };
    const SECONDARY = {
      type: "hierarchical" as const,
      style: "secondary" as const,
    };

    /** 24pt-wide leading icon slot. Renders a transparent placeholder when
     * no icon is set so titles stay aligned across rows. */
    const renderIcon = (icon: IconName) => (
      <SwiftImage
        systemName={(icon ?? "circle") as any}
        size={18}
        modifiers={[
          frame({ width: 24, alignment: "leading" }),
          foregroundStyle(SECONDARY),
          ...(icon ? [] : [opacity(0)]),
        ]}
      />
    );

    /** Small-caps section header + thin separator that fills the row width. */
    const renderSectionHeader = (sectionTitle: string, key: string) => (
      <HStack
        key={key}
        spacing={10}
        alignment='center'
        modifiers={[frame({ height: 28 })]}
      >
        <SwiftText
          modifiers={[
            font({ size: 11, weight: "semibold" }),
            foregroundStyle(TERTIARY),
          ]}
        >
          {sectionTitle.toUpperCase()}
        </SwiftText>
        <SwiftRectangle
          modifiers={[frame({ height: 1 }), foregroundStyle(TERTIARY)]}
        />
      </HStack>
    );

    /** Bare hairline used to close out a multi-row titled section. */
    const renderDivider = (key: string) => (
      <SwiftRectangle
        key={key}
        modifiers={[
          frame({ height: 1 }),
          foregroundStyle(TERTIARY),
          padding({ vertical: 2 }),
        ]}
      />
    );

    /** Render menu-safe children (radio/action) inside a SwiftUI Menu. */
    const renderMenuChild = (option: Option, key: string): any => {
      if (option.type === "radio") {
        return (
          <Button
            key={key}
            label={option.label}
            systemImage={
              (option.selected ? "checkmark.circle.fill" : "circle") as any
            }
            modifiers={option.disabled ? [disabled(true)] : undefined}
            onPress={() => {
              option.onPress();
              onOptionSelect?.(option.value);
              closePopover();
            }}
          />
        );
      }
      if (option.type === "action") {
        return (
          <Button
            key={key}
            label={option.label}
            modifiers={option.disabled ? [disabled(true)] : undefined}
            onPress={() => {
              option.onPress();
              closePopover();
            }}
          />
        );
      }
      return null;
    };

    /** Row that opens a SwiftUI Menu on tap. Used for compressed radio
     * groups and for subgroup options inside a multi-row section. */
    const renderMenuRow = ({
      key,
      icon,
      title: rowTitle,
      valueLabel,
      children,
    }: {
      key: string;
      icon: IconName;
      title: string;
      valueLabel?: string;
      children: any;
    }) => (
      <Menu
        key={key}
        label={
          <HStack
            spacing={10}
            alignment='center'
            modifiers={[frame({ height: 44 })]}
          >
            {renderIcon(icon)}
            <SwiftText modifiers={[font({ size: 15 })]}>{rowTitle}</SwiftText>
            <Spacer />
            {valueLabel ? (
              <SwiftText
                modifiers={[font({ size: 13 }), foregroundStyle(SECONDARY)]}
              >
                {valueLabel}
              </SwiftText>
            ) : null}
            <SwiftImage
              systemName={MENU_CHEVRON as any}
              size={12}
              modifiers={[foregroundStyle(TERTIARY)]}
            />
          </HStack>
        }
      >
        {children}
      </Menu>
    );

    const renderSliderRow = (option: SliderOption, key: string) => {
      const display = option.format
        ? option.format(option.value)
        : option.value.toString();
      return (
        <HStack
          key={key}
          spacing={10}
          alignment='center'
          modifiers={[frame({ height: 44 })]}
        >
          {renderIcon(option.icon)}
          <SwiftText
            modifiers={[
              font({ size: 15 }),
              frame({ width: 64, alignment: "leading" }),
            ]}
          >
            {option.label}
          </SwiftText>
          <SwiftSlider
            value={option.value}
            min={option.min}
            max={option.max}
            step={option.step}
            modifiers={option.disabled ? [disabled(true)] : undefined}
            onValueChange={option.onValueChange}
          />
          <SwiftText
            modifiers={[
              font({ size: 13, design: "monospaced" }),
              foregroundStyle(SECONDARY),
              frame({ width: 44, alignment: "trailing" }),
            ]}
          >
            {display}
          </SwiftText>
        </HStack>
      );
    };

    const renderStepperRow = (option: StepperOption, key: string) => {
      const display = option.format
        ? option.format(option.value)
        : option.value.toString();
      return (
        <HStack
          key={key}
          spacing={10}
          alignment='center'
          modifiers={[frame({ height: 44 })]}
        >
          {renderIcon(option.icon)}
          <SwiftText modifiers={[font({ size: 15 })]}>{option.label}</SwiftText>
          <Spacer />
          <Stepper
            label={display}
            value={option.value}
            step={option.step}
            min={option.min}
            max={option.max}
            modifiers={option.disabled ? [disabled(true)] : undefined}
            onValueChange={option.onValueChange}
          />
        </HStack>
      );
    };

    const renderToggleRow = (option: ToggleOption, key: string) => (
      <HStack
        key={key}
        spacing={10}
        alignment='center'
        modifiers={[frame({ height: 44 })]}
      >
        {renderIcon(option.icon)}
        <SwiftText modifiers={[font({ size: 15 })]}>{option.label}</SwiftText>
        <Spacer />
        <SwiftToggle
          label=''
          value={option.value}
          modifiers={option.disabled ? [disabled(true)] : undefined}
          onValueChange={() => {
            option.onToggle();
            onOptionSelect?.(option.value);
          }}
        />
      </HStack>
    );

    const renderActionRow = (option: ActionOption, key: string) => (
      <Button
        key={key}
        modifiers={[
          buttonStyle("plain"),
          ...(option.disabled ? [disabled(true)] : []),
        ]}
        onPress={() => {
          option.onPress();
          closePopover();
        }}
      >
        <HStack
          spacing={10}
          alignment='center'
          modifiers={[frame({ height: 44 })]}
        >
          {renderIcon(option.icon)}
          <SwiftText modifiers={[font({ size: 15 })]}>{option.label}</SwiftText>
          <Spacer />
        </HStack>
      </Button>
    );

    /** Render one Option as its own row inside a mixed (non-compressed)
     * section. */
    const renderOptionRow = (option: Option, key: string): any => {
      if (option.type === "slider") return renderSliderRow(option, key);
      if (option.type === "stepper") return renderStepperRow(option, key);
      if (option.type === "toggle") return renderToggleRow(option, key);
      if (option.type === "action") return renderActionRow(option, key);
      if (option.type === "subgroup") {
        const selectedChild = option.options.find(
          (o): o is RadioOption => o.type === "radio" && o.selected,
        );
        return renderMenuRow({
          key,
          icon: option.icon,
          title: option.label,
          valueLabel: selectedChild?.label,
          children: option.options.map((child, idx) =>
            renderMenuChild(child, `${key}-c${idx}`),
          ),
        });
      }
      if (option.type === "radio") {
        return (
          <Button
            key={key}
            modifiers={[
              buttonStyle("plain"),
              ...(option.disabled ? [disabled(true)] : []),
            ]}
            onPress={() => {
              option.onPress();
              onOptionSelect?.(option.value);
              closePopover();
            }}
          >
            <HStack
              spacing={10}
              alignment='center'
              modifiers={[frame({ height: 44 })]}
            >
              {renderIcon(option.icon)}
              <SwiftText modifiers={[font({ size: 15 })]}>
                {option.label}
              </SwiftText>
              <Spacer />
              {option.selected ? (
                <SwiftImage
                  systemName={"checkmark" as any}
                  size={14}
                  modifiers={[foregroundStyle(SECONDARY)]}
                />
              ) : null}
            </HStack>
          </Button>
        );
      }
      return null;
    };

    /**
     * Render an entire OptionGroup.
     *   - Titled group with only radio (or radio + action) options →
     *     compressed to a single Menu row.
     *   - Titled group containing slider/toggle/stepper/subgroup →
     *     section header + individual rows.
     *   - Untitled group → individual rows, no header.
     */
    const renderGroup = (group: OptionGroup, groupIndex: number): any[] => {
      if (group.options.length === 0) return [];

      const onlyMenuSafe = group.options.every(
        (o) => o.type === "radio" || o.type === "action",
      );

      if (group.title && onlyMenuSafe) {
        const selectedRadio = group.options.find(
          (o): o is RadioOption => o.type === "radio" && o.selected,
        );
        return [
          renderMenuRow({
            key: `group-${groupIndex}`,
            icon: group.icon,
            title: group.title,
            valueLabel: selectedRadio?.label,
            children: group.options.map((opt, idx) =>
              renderMenuChild(opt, `g${groupIndex}-c${idx}`),
            ),
          }),
        ];
      }

      const rows: any[] = [];
      if (group.title) {
        rows.push(renderSectionHeader(group.title, `header-${groupIndex}`));
      }
      group.options.forEach((opt, idx) => {
        rows.push(renderOptionRow(opt, `g${groupIndex}-o${idx}`));
      });
      return rows;
    };

    return (
      <MeasuredTriggerHost
        trigger={trigger}
        hostStyle={expoUIConfig?.hostStyle}
      >
        <Popover
          isPresented={iosOpen}
          onIsPresentedChange={handleIosOpenChange}
          arrowEdge='top'
        >
          <Popover.Trigger>
            {/* Wrap the RN trigger view in a SwiftUI Button so tap handling
                is captured at the SwiftUI layer (matches the codebase
                pattern in SearchTabButtons.tsx). */}
            <Button
              modifiers={[buttonStyle("plain")]}
              onPress={() => handleIosOpenChange(true)}
            >
              {trigger}
            </Button>
          </Popover.Trigger>
          <Popover.Content>
            {/* Bare VStack — no Form/List chrome — so the panel reads as
                the Swift mock's floating glass card. The popover itself
                supplies the material background; we just stack rows
                inside. Width pinned to ~320pt; height >= 480pt. */}
            <VStack
              spacing={0}
              alignment='leading'
              modifiers={[
                padding({ horizontal: 18, top: 12, bottom: 12 }),
                frame({
                  minWidth: 300,
                  idealWidth: 320,
                  maxWidth: 360,
                  minHeight: 480,
                  idealHeight: 520,
                }),
                // Tint cascades to all child controls — Slider track, Menu
                // checkmark, Stepper ± buttons, Toggle — so one modifier
                // paints the whole popover white instead of system blue.
                tint("white"),
              ]}
            >
              {groups.flatMap((group, groupIndex) => {
                const rows = renderGroup(group, groupIndex);
                if (rows.length === 0) return [];
                // After a multi-row titled section (Subtitles), append a
                // bare hairline divider so it's clearly separated from
                // the next group below.
                const isMultiRow =
                  !!group.title &&
                  !group.options.every(
                    (o) => o.type === "radio" || o.type === "action",
                  );
                const hasNext = groupIndex < groups.length - 1;
                return isMultiRow && hasNext
                  ? [...rows, renderDivider(`footer-${groupIndex}`)]
                  : rows;
              })}
            </VStack>
          </Popover.Content>
        </Popover>
      </MeasuredTriggerHost>
    );
  }

  // Android: open the bottom sheet directly on press (uncontrolled mode).
  const handlePress = () => {
    showModal(
      <BottomSheetContent
        title={title}
        groups={groups}
        onOptionSelect={onOptionSelect}
        onClose={hideModal}
      />,
      {
        snapPoints: ["90%"],
        enablePanDownToClose: bottomSheetConfig?.enablePanDownToClose ?? true,
      },
    );
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      {trigger || <Text className='text-white'>Open Menu</Text>}
    </TouchableOpacity>
  );
};

// Memoize to prevent unnecessary re-renders when parent re-renders.
export const PlayerSettingsPopover = React.memo(
  PlayerSettingsPopoverComponent,
  (prevProps, nextProps) =>
    prevProps.title === nextProps.title &&
    prevProps.open === nextProps.open &&
    prevProps.groups === nextProps.groups &&
    prevProps.trigger === nextProps.trigger,
);
