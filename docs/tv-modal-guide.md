# TV Modal Guide

This document explains how to implement modals, bottom sheets, and overlays on Apple TV and Android TV in React Native.

## The Problem

On TV platforms, modals have unique challenges:
- The hardware back button must work correctly to dismiss modals
- Focus management must be handled explicitly
- React Native's `Modal` component breaks the TV focus chain
- Overlay/absolute-positioned modals don't handle back button correctly

## Navigation-Based Modal Pattern (Recommended)

For modals that need proper back button support, use the **navigation-based modal pattern**. This leverages Expo Router's stack navigation with transparent modal presentation.

### Architecture

```
┌─────────────────────────────────────┐
│  1. Jotai Atom (state)              │
│     Stores modal data/params        │
├─────────────────────────────────────┤
│  2. Hook (trigger)                  │
│     Sets atom + calls router.push() │
├─────────────────────────────────────┤
│  3. Page File (UI)                  │
│     Reads atom, renders modal       │
│     Clears atom on unmount          │
├─────────────────────────────────────┤
│  4. Stack.Screen (config)           │
│     presentation: transparentModal  │
│     animation: fade                 │
└─────────────────────────────────────┘
```

### Step 1: Create the Atom

Create a Jotai atom to store the modal state/data:

```typescript
// utils/atoms/tvExampleModal.ts
import { atom } from "jotai";

export interface TVExampleModalData {
  itemId: string;
  title: string;
  // ... other data the modal needs
}

export const tvExampleModalAtom = atom<TVExampleModalData | null>(null);
```

### Step 2: Create the Hook

Create a hook that sets the atom and navigates to the modal:

```typescript
// hooks/useTVExampleModal.ts
import { useSetAtom } from "jotai";
import { router } from "expo-router";
import { tvExampleModalAtom, TVExampleModalData } from "@/utils/atoms/tvExampleModal";

export const useTVExampleModal = () => {
  const setModalData = useSetAtom(tvExampleModalAtom);

  const openModal = (data: TVExampleModalData) => {
    setModalData(data);
    router.push("/tv-example-modal");
  };

  return { openModal };
};
```

### Step 3: Create the Modal Page

Create a page file that reads the atom and renders the modal UI:

```typescript
// app/(auth)/tv-example-modal.tsx
import { useEffect } from "react";
import { View, Pressable, Text } from "react-native";
import { useAtom } from "jotai";
import { router } from "expo-router";
import { BlurView } from "expo-blur";
import { tvExampleModalAtom } from "@/utils/atoms/tvExampleModal";

export default function TVExampleModal() {
  const [modalData, setModalData] = useAtom(tvExampleModalAtom);

  // Clear atom on unmount
  useEffect(() => {
    return () => {
      setModalData(null);
    };
  }, [setModalData]);

  // Handle case where modal is opened without data
  if (!modalData) {
    router.back();
    return null;
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      {/* Background overlay */}
      <Pressable
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.7)",
        }}
        onPress={() => router.back()}
      />

      {/* Modal content */}
      <BlurView
        intensity={80}
        tint="dark"
        style={{
          padding: 32,
          borderRadius: 16,
          minWidth: 400,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 24 }}>
          {modalData.title}
        </Text>
        {/* Modal content here */}

        <Pressable
          onPress={() => router.back()}
          hasTVPreferredFocus
          style={({ focused }) => ({
            marginTop: 24,
            padding: 16,
            borderRadius: 8,
            backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.1)",
          })}
        >
          {({ focused }) => (
            <Text style={{ color: focused ? "#000" : "#fff" }}>
              Close
            </Text>
          )}
        </Pressable>
      </BlurView>
    </View>
  );
}
```

### Step 4: Add Stack.Screen Configuration

Add the modal route to `app/_layout.tsx`:

```typescript
// In app/_layout.tsx, inside your Stack navigator
<Stack.Screen
  name="(auth)/tv-example-modal"
  options={{
    presentation: "transparentModal",
    animation: "fade",
    headerShown: false,
  }}
/>
```

### Usage

```typescript
// In any component
import { useTVExampleModal } from "@/hooks/useTVExampleModal";

const MyComponent = () => {
  const { openModal } = useTVExampleModal();

  return (
    <Pressable
      onPress={() => openModal({ itemId: "123", title: "Example" })}
    >
      <Text>Open Modal</Text>
    </Pressable>
  );
};
```

### Reference Implementation

See `useTVRequestModal` + `app/(auth)/tv-request-modal.tsx` for a complete working example.

---

## Bottom Sheet Pattern (Inline Overlays)

For simpler overlays that don't need back button navigation (like option selectors), use an **inline absolute-positioned overlay**. This pattern is ideal for:
- Dropdown selectors
- Quick action menus
- Option pickers

### Key Principles

1. **Use absolute positioning instead of Modal** - React Native's `Modal` breaks the TV focus chain
2. **Horizontal ScrollView for options** - Natural for TV remotes (left/right D-pad)
3. **Disable background focus** - Prevent focus flickering between overlay and background

### Implementation

```typescript
import { useState } from "react";
import { View, ScrollView, Pressable, Text } from "react-native";
import { BlurView } from "expo-blur";

const TVOptionSelector: React.FC<{
  options: { label: string; value: string }[];
  selectedValue: string;
  onSelect: (value: string) => void;
  isOpen: boolean;
  onClose: () => void;
}> = ({ options, selectedValue, onSelect, isOpen, onClose }) => {
  if (!isOpen) return null;

  const selectedIndex = options.findIndex(o => o.value === selectedValue);

  return (
    <View
      style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
    >
      <BlurView
        intensity={80}
        tint="dark"
        style={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingVertical: 32,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ overflow: "visible" }}
          contentContainerStyle={{
            paddingHorizontal: 48,
            paddingVertical: 10,
            gap: 12,
          }}
        >
          {options.map((option, index) => (
            <TVOptionCard
              key={option.value}
              label={option.label}
              isSelected={option.value === selectedValue}
              hasTVPreferredFocus={index === selectedIndex}
              onPress={() => {
                onSelect(option.value);
                onClose();
              }}
            />
          ))}
        </ScrollView>
      </BlurView>
    </View>
  );
};
```

### Option Card Component

```typescript
import { useState, useRef, useEffect } from "react";
import { Pressable, Text, Animated } from "react-native";

const TVOptionCard: React.FC<{
  label: string;
  isSelected: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
}> = ({ label, isSelected, hasTVPreferredFocus, onPress }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: true,
      tension: 50,
      friction: 7,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.05);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.08)",
          paddingHorizontal: 24,
          paddingVertical: 16,
          borderRadius: 12,
          borderWidth: isSelected ? 2 : 0,
          borderColor: "#fff",
        }}
      >
        <Text style={{ color: focused ? "#000" : "#fff", fontSize: 18 }}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};
```

### Reference Implementation

See `TVOptionSelector` and `TVOptionCard` in `components/ItemContent.tv.tsx`.

---

## Focus Management for Overlays

**CRITICAL**: When displaying overlays on TV, you must explicitly disable focus on all background elements. Without this, the TV focus engine will rapidly switch between overlay and background elements, causing a focus loop.

### Solution

Add a `disabled` prop to every focusable component and pass `disabled={isModalOpen}` when an overlay is visible:

```typescript
// 1. Track modal state
const [openModal, setOpenModal] = useState<ModalType | null>(null);
const isModalOpen = openModal !== null;

// 2. Each focusable component accepts disabled prop
const TVFocusableButton: React.FC<{
  onPress: () => void;
  disabled?: boolean;
}> = ({ onPress, disabled }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    focusable={!disabled}
    hasTVPreferredFocus={isFirst && !disabled}
  >
    {/* content */}
  </Pressable>
);

// 3. Pass disabled to all background components when modal is open
<TVFocusableButton onPress={handlePress} disabled={isModalOpen} />
```

### Reference Implementation

See `settings.tv.tsx` for a complete example with `TVSettingsOptionButton`, `TVSettingsToggle`, `TVSettingsStepper`, etc.

---

## Focus Trapping

For modals that should trap focus (prevent navigation outside the modal), use `TVFocusGuideView` with trap props:

```typescript
import { TVFocusGuideView } from "react-native";

<TVFocusGuideView
  trapFocusUp
  trapFocusDown
  trapFocusLeft
  trapFocusRight
>
  {/* Modal content - focus cannot escape */}
</TVFocusGuideView>
```

**Warning**: Don't use `autoFocus` on focus guide wrappers when you also have bidirectional focus guides - it can interfere with navigation.

---

## Common Mistakes

| Mistake | Result | Fix |
|---------|--------|-----|
| Using React Native `Modal` | Focus chain breaks | Use navigation-based or absolute positioning |
| Overlay without disabling background focus | Focus flickering loop | Add `disabled` prop to all background focusables |
| No `hasTVPreferredFocus` in modal | Focus stuck on background | Set preferred focus on first modal element |
| Missing `presentation: "transparentModal"` | Modal not transparent | Add to Stack.Screen options |
| Not clearing atom on unmount | Stale data on reopen | Clear in useEffect cleanup |

---

## When to Use Which Pattern

| Scenario | Pattern |
|----------|---------|
| Full-screen modal with back button | Navigation-based modal |
| Confirmation dialogs | Navigation-based modal |
| Option selectors / dropdowns | Bottom sheet (inline) |
| Quick action menus | Bottom sheet (inline) |
| Complex forms | Navigation-based modal |
