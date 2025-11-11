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

## Why
PlatformDropdown wraps triggers in TouchableOpacity on Android. Nested TouchableOpacity causes touch event conflicts.

