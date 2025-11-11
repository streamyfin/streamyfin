# Nested Modals with PlatformDropdown

## Issue
PlatformDropdowns inside BottomSheetModals don't open on Android.

## Solution
1. **Add controlled state** for each PlatformDropdown:
   ```tsx
   const [open, setOpen] = useState(false);
   
   <PlatformDropdown
     open={open}
     onOpenChange={setOpen}
     // ...
   />
   ```

2. **Use `View` for triggers, not `TouchableOpacity`**:
   ```tsx
   // ✅ Correct
   <PlatformDropdown
     trigger={<View>...</View>}
   />
   
   // ❌ Wrong - causes nested TouchableOpacity conflicts
   <PlatformDropdown
     trigger={<TouchableOpacity>...</TouchableOpacity>}
   />
   ```

3. **Add `stackBehavior='push'` to parent BottomSheetModal**:
   ```tsx
   <BottomSheetModal
     stackBehavior='push'
     // ...
   />
   ```

4. **Reset dropdown states on modal dismiss**:
   ```tsx
   const handleDismiss = useCallback(() => {
     setDropdown1Open(false);
     setDropdown2Open(false);
     // reset all dropdown states
     onDismiss?.();
   }, [onDismiss]);

   <BottomSheetModal
     onDismiss={handleDismiss}
     // ...
   />
   ```

## Why
- PlatformDropdown wraps triggers in TouchableOpacity on Android. Nested TouchableOpacity causes touch event conflicts.
- PlatformDropdown's useEffect should only call `showModal()` when `open === true`, not call `hideModal()` when `open === false` (interferes with parent modals).
- Dropdown states must be reset on modal dismiss to prevent them from reopening automatically when parent modal reopens.

