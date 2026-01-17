# TV Focus Guide Navigation

This document explains how to use `TVFocusGuideView` to create reliable focus navigation between non-adjacent sections on Apple TV and Android TV.

## The Problem

tvOS uses a **geometric focus engine** that draws a ray in the navigation direction and finds the nearest focusable element. This works well for adjacent elements but fails when:

- Sections are not geometrically aligned (e.g., left-aligned buttons above a horizontally-scrolling list)
- Lists are long and the "nearest" element is in the middle rather than the first item
- There's empty space between focusable sections

**Symptoms:**
- Focus lands in the middle of a list instead of the first item
- Can't navigate down to a section at all
- Focus jumps to unexpected elements

## The Solution: TVFocusGuideView with destinations

`TVFocusGuideView` is a React Native component that creates an invisible focus region. When combined with the `destinations` prop, it redirects focus to specific elements.

### Basic Pattern

```typescript
import { TVFocusGuideView, View } from "react-native";

// 1. Track the destination element with state (NOT useRef!)
const [targetRef, setTargetRef] = useState<View | null>(null);

// 2. Place an invisible focus guide between sections
{targetRef && (
  <TVFocusGuideView
    destinations={[targetRef]}
    style={{ height: 1, width: "100%" }}
  />
)}

// 3. Pass the state setter as a callback ref to the target
<TargetComponent ref={setTargetRef} />
```

### Why useState Instead of useRef?

The focus guide only updates when it receives a prop change. Using `useRef` won't trigger re-renders when the ref is set, so the focus guide won't know about the destination. **Always use `useState`** to track refs for focus guides.

```typescript
// ❌ Won't work - useRef doesn't trigger re-renders
const targetRef = useRef<View>(null);
<TVFocusGuideView destinations={targetRef.current ? [targetRef.current] : []} />

// ✅ Works - useState triggers re-render when ref is set
const [targetRef, setTargetRef] = useState<View | null>(null);
<TVFocusGuideView destinations={targetRef ? [targetRef] : []} />
```

## Complete Example: Bidirectional Navigation

This example shows how to create focus navigation between a vertical list of buttons and a horizontal ScrollView of cards.

### Step 1: Convert Components to forwardRef

Any component that needs to be a focus destination must forward its ref:

```typescript
const TVOptionButton = React.forwardRef<
  View,
  {
    label: string;
    onPress: () => void;
  }
>(({ label, onPress }, ref) => {
  return (
    <Pressable ref={ref} onPress={onPress}>
      <Text>{label}</Text>
    </Pressable>
  );
});

const TVActorCard = React.forwardRef<
  View,
  {
    name: string;
    onPress: () => void;
  }
>(({ name, onPress }, ref) => {
  return (
    <Pressable ref={ref} onPress={onPress}>
      <Text>{name}</Text>
    </Pressable>
  );
});
```

### Step 2: Track Refs with State

```typescript
const MyScreen: React.FC = () => {
  // Track the first actor card (for downward navigation)
  const [firstActorRef, setFirstActorRef] = useState<View | null>(null);

  // Track the last option button (for upward navigation)
  const [lastButtonRef, setLastButtonRef] = useState<View | null>(null);

  // ...
};
```

### Step 3: Place Focus Guides

```typescript
return (
  <View style={{ flex: 1 }}>
    {/* Option buttons */}
    <View>
      <TVOptionButton label="Quality" onPress={...} />
      <TVOptionButton label="Audio" onPress={...} />
      <TVOptionButton
        ref={setLastButtonRef}  // Last button gets the ref
        label="Subtitles"
        onPress={...}
      />
    </View>

    {/* Focus guide: options → cast (downward navigation) */}
    {firstActorRef && (
      <TVFocusGuideView
        destinations={[firstActorRef]}
        style={{ height: 1, width: "100%" }}
      />
    )}

    {/* Cast section */}
    <View>
      <Text>Cast</Text>

      {/* Focus guide: cast → options (upward navigation) */}
      {lastButtonRef && (
        <TVFocusGuideView
          destinations={[lastButtonRef]}
          style={{ height: 1, width: "100%" }}
        />
      )}

      <ScrollView horizontal>
        {actors.map((actor, index) => (
          <TVActorCard
            key={actor.id}
            ref={index === 0 ? setFirstActorRef : undefined}  // First card gets the ref
            name={actor.name}
            onPress={...}
          />
        ))}
      </ScrollView>
    </View>
  </View>
);
```

### Step 4: Handle Dynamic "Last" Element

When the last button varies based on conditions (e.g., subtitle button only shows if subtitles exist), compute which one is last:

```typescript
// Determine which button is last
const lastOptionButton = useMemo(() => {
  if (hasSubtitles) return "subtitle";
  if (hasAudio) return "audio";
  return "quality";
}, [hasSubtitles, hasAudio]);

// Pass ref only to the last one
<TVOptionButton
  ref={lastOptionButton === "quality" ? setLastButtonRef : undefined}
  label="Quality"
  onPress={...}
/>
<TVOptionButton
  ref={lastOptionButton === "audio" ? setLastButtonRef : undefined}
  label="Audio"
  onPress={...}
/>
<TVOptionButton
  ref={lastOptionButton === "subtitle" ? setLastButtonRef : undefined}
  label="Subtitles"
  onPress={...}
/>
```

## Focus Guide Placement

The focus guide should be placed **between** the source and destination sections:

```
┌─────────────────────────┐
│  Option Buttons         │  ← Source (going down)
│  [Quality] [Audio]      │
└─────────────────────────┘
┌─────────────────────────┐
│  TVFocusGuideView       │  ← Invisible guide (height: 1px)
│  destinations=[actor1]  │     Catches downward navigation
└─────────────────────────┘
┌─────────────────────────┐
│  TVFocusGuideView       │  ← Invisible guide (height: 1px)
│  destinations=[lastBtn] │     Catches upward navigation
├─────────────────────────┤
│  Actor Cards            │  ← Destination (going down)
│  [👤] [👤] [👤] [👤]    │     Source (going up)
└─────────────────────────┘
```

## Tips and Gotchas

1. **Guard against null refs**: Only render the focus guide when the ref is set:
   ```typescript
   {targetRef && <TVFocusGuideView destinations={[targetRef]} />}
   ```

2. **Style the guide invisibly**: Use `height: 1` or `width: 1` to make it invisible but still functional:
   ```typescript
   style={{ height: 1, width: "100%" }}
   ```

3. **Multiple destinations**: You can provide multiple destinations and the focus engine will pick the geometrically closest one:
   ```typescript
   <TVFocusGuideView destinations={[ref1, ref2, ref3]} />
   ```

4. **Focus trapping**: Use `trapFocusUp`, `trapFocusDown`, etc. to prevent focus from leaving a region (useful for modals):
   ```typescript
   <TVFocusGuideView trapFocusUp trapFocusDown trapFocusLeft trapFocusRight>
     {/* Modal content */}
   </TVFocusGuideView>
   ```

5. **Auto focus**: Use `autoFocus` to automatically focus the first focusable child:
   ```typescript
   <TVFocusGuideView autoFocus>
     {/* First focusable child will receive focus */}
   </TVFocusGuideView>
   ```

## Reference Implementation

See `components/ItemContent.tv.tsx` for a complete implementation of bidirectional focus navigation between playback options and the cast list.
