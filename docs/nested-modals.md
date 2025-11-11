# Nested Modals with PlatformDropdown

## Issue
PlatformDropdowns inside BottomSheetModals don't open on Android, or dropdowns reopen unexpectedly after navigation.

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

2. **Memoize groups and callbacks** to prevent unnecessary re-renders:
   ```tsx
   const handleOption1 = useCallback(() => {
     // handler logic
   }, [dependencies]);

   const dropdownGroups = useMemo(() => [
     {
       title: "Group 1",
       options: [
         {
           type: "radio",
           label: "Option 1",
           value: "option1",
           selected: state === "option1",
           onPress: handleOption1,
         },
       ],
     },
   ], [state, handleOption1]);

   <PlatformDropdown
     groups={dropdownGroups}
     // ...
   />
   ```

3. **Use `View` for triggers, not `TouchableOpacity`**:
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

4. **Add `stackBehavior='push'` to parent BottomSheetModal**:
   ```tsx
   <BottomSheetModal
     stackBehavior='push'
     // ...
   />
   ```

5. **Reset dropdown states on modal dismiss**:
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
- PlatformDropdown tracks internal `isModalShowing` state to prevent duplicate `showModal()` calls when dependencies change.
- Memoizing groups prevents the useEffect from re-triggering unnecessarily, which can cause modals to reopen after navigation.
- Dropdown states must be reset on modal dismiss to prevent them from reopening automatically when parent modal reopens.

