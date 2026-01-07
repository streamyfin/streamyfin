# Global Modal System with Gorhom Bottom Sheet

This guide explains how to use the global modal system implemented in this project.

## Overview

The global modal system allows you to trigger a bottom sheet modal from anywhere in your app programmatically, and render any component inside it.

## Architecture

The system consists of three main parts:

1. **GlobalModalProvider** (`providers/GlobalModalProvider.tsx`) - Context provider that manages modal state
2. **GlobalModal** (`components/GlobalModal.tsx`) - The actual modal component rendered at root level
3. **useGlobalModal** hook - Hook to interact with the modal from anywhere

## Setup (Already Configured)

The system is already integrated into your app:

```tsx
// In app/_layout.tsx
<BottomSheetModalProvider>
  <GlobalModalProvider>
    {/* Your app content */}
    <GlobalModal />
  </GlobalModalProvider>
</BottomSheetModalProvider>
```

## Usage

### Basic Usage

```tsx
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import { View, Text } from "react-native";

function MyComponent() {
  const { showModal, hideModal } = useGlobalModal();

  const handleOpenModal = () => {
    showModal(
      <View className='p-6'>
        <Text className='text-white text-2xl'>Hello from Modal!</Text>
      </View>
    );
  };

  return (
    <Button onPress={handleOpenModal} title="Open Modal" />
  );
}
```

### With Custom Options

```tsx
const handleOpenModal = () => {
  showModal(
    <YourCustomComponent />,
    {
      snapPoints: ["25%", "50%", "90%"],  // Custom snap points
      enablePanDownToClose: true,          // Allow swipe to close
      backgroundStyle: {                   // Custom background
        backgroundColor: "#000000",
      },
    }
  );
};
```

### Programmatic Control

```tsx
// Open modal
showModal(<Content />);

// Close modal from within the modal content
function ModalContent() {
  const { hideModal } = useGlobalModal();
  
  return (
    <View>
      <Button onPress={hideModal} title="Close" />
    </View>
  );
}

// Close modal from outside
hideModal();
```

### In Event Handlers or Functions

```tsx
function useApiCall() {
  const { showModal } = useGlobalModal();
  
  const fetchData = async () => {
    try {
      const result = await api.fetch();
      
      // Show success modal
      showModal(
        <SuccessMessage data={result} />
      );
    } catch (error) {
      // Show error modal
      showModal(
        <ErrorMessage error={error} />
      );
    }
  };
  
  return fetchData;
}
```

## API Reference

### `useGlobalModal()`

Returns an object with the following properties:

- **`showModal(content, options?)`** - Show the modal with given content
  - `content: ReactNode` - Any React component or element to render
  - `options?: ModalOptions` - Optional configuration object
  
- **`hideModal()`** - Programmatically hide the modal

- **`isVisible: boolean`** - Current visibility state of the modal

### `ModalOptions`

```typescript
interface ModalOptions {
  enableDynamicSizing?: boolean;        // Auto-size based on content (default: true)
  snapPoints?: (string | number)[];     // Fixed snap points (e.g., ["50%", "90%"])
  enablePanDownToClose?: boolean;       // Allow swipe down to close (default: true)
  backgroundStyle?: object;             // Custom background styles
  handleIndicatorStyle?: object;        // Custom handle indicator styles
}
```

## Examples

See `components/ExampleGlobalModalUsage.tsx` for comprehensive examples including:
- Simple content modal
- Modal with custom snap points
- Complex component in modal
- Success/error modals triggered from functions

## Default Styling

The modal uses these default styles (can be overridden via options):

```typescript
{
  enableDynamicSizing: true,
  enablePanDownToClose: true,
  backgroundStyle: {
    backgroundColor: "#171717",  // Dark background
  },
  handleIndicatorStyle: {
    backgroundColor: "white",
  },
}
```

## Best Practices

1. **Keep content in separate components** - Don't inline large JSX in `showModal()` calls
2. **Use the hook in custom hooks** - Create specialized hooks like `useShowSuccessModal()` for reusable modal patterns
3. **Handle cleanup** - The modal automatically clears content when closed
4. **Avoid nesting** - Don't show modals from within modals
5. **Consider UX** - Only use for important, contextual information that requires user attention

## Using with PlatformDropdown

When using `PlatformDropdown` with option groups, avoid setting a `title` on the `OptionGroup` if you're already passing a `title` prop to `PlatformDropdown`. This prevents nested menu behavior on iOS where users have to click through an extra layer.

```tsx
// Good - No title in option group (title is on PlatformDropdown)
const optionGroups: OptionGroup[] = [
  {
    options: items.map((item) => ({
      type: "radio",
      label: item.name,
      value: item,
      selected: item.id === selected?.id,
      onPress: () => onChange(item),
    })),
  },
];

<PlatformDropdown
  groups={optionGroups}
  title="Select Item"  // Title here
  // ...
/>

// Bad - Causes nested menu on iOS
const optionGroups: OptionGroup[] = [
  {
    title: "Items",  // This creates a nested Picker on iOS
    options: items.map((item) => ({
      type: "radio",
      label: item.name,
      value: item,
      selected: item.id === selected?.id,
      onPress: () => onChange(item),
    })),
  },
];
```

## Troubleshooting

### Modal doesn't appear
- Ensure `GlobalModalProvider` is above the component calling `useGlobalModal()`
- Check that `BottomSheetModalProvider` is present in the tree
- Verify `GlobalModal` component is rendered

### Content is cut off
- Use `enableDynamicSizing: true` for auto-sizing
- Or specify appropriate `snapPoints`

### Modal won't close
- Ensure `enablePanDownToClose` is `true`
- Check that backdrop is clickable
- Use `hideModal()` for programmatic closing
