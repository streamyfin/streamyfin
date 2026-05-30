# TV Focus Guide Navigation

This document explains how to use `TVFocusGuideView` to create reliable focus navigation between non-adjacent sections on Apple TV and Android TV.

## Platform Differences (CRITICAL)

### tvOS vs Android TV

**`nextFocusUp`, `nextFocusDown`, `nextFocusLeft`, `nextFocusRight` props only work on Android TV, NOT tvOS.**

This is a [known limitation](https://github.com/react-native-tvos/react-native-tvos/issues/490). These props are documented as "only for Android" in React Native.

```typescript
// ❌ Does NOT work on tvOS (Apple TV)
<Pressable nextFocusUp={someNodeHandle} nextFocusDown={anotherNodeHandle}>
  ...
</Pressable>

// ✅ Works on both tvOS and Android TV
<TVFocusGuideView destinations={[targetRef]}>
  ...
</TVFocusGuideView>
```

**For tvOS, always use `TVFocusGuideView` with the `destinations` prop.**

## ScrollView vs FlatList for TV

**Use ScrollView instead of FlatList for horizontal lists on TV when focus navigation is critical.**

FlatList only renders visible items and manages its own recycling, which can interfere with focus navigation. ScrollView renders all items at once, providing more predictable focus behavior.

```typescript
// ❌ FlatList can cause focus issues on TV
<FlatList
  horizontal
  data={cast}
  renderItem={({ item, index }) => <CastCard ... />}
/>

// ✅ ScrollView provides reliable focus navigation
<ScrollView horizontal>
  {cast.map((person, index) => (
    <CastCard key={person.id} ... />
  ))}
</ScrollView>
```

**When to use which:**
- **ScrollView**: Small to medium lists (< 20 items) where focus navigation must be reliable
- **FlatList**: Large lists where performance is more important than perfect focus navigation

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

## Bidirectional Navigation (CRITICAL PATTERN)

When you need focus to navigate both UP and DOWN between sections, you must stack both focus guides together AND avoid `hasTVPreferredFocus` on the destination element.

### The Focus Flickering Problem

If you use `hasTVPreferredFocus={true}` on an element that is ALSO the destination of a focus guide, you will get **focus flickering** where focus rapidly jumps back and forth between elements.

```typescript
// ❌ CAUSES FOCUS FLICKERING - destination has hasTVPreferredFocus
<TVFocusGuideView destinations={[firstCardRef]} />
<ScrollView horizontal>
  {items.map((item, index) => (
    <Card
      ref={index === 0 ? setFirstCardRef : undefined}
      hasTVPreferredFocus={index === 0}  // ❌ DON'T DO THIS
    />
  ))}
</ScrollView>

// ✅ CORRECT - destination does NOT have hasTVPreferredFocus
<TVFocusGuideView destinations={[firstCardRef]} />
<ScrollView horizontal>
  {items.map((item, index) => (
    <Card
      ref={index === 0 ? setFirstCardRef : undefined}
      // No hasTVPreferredFocus - the focus guide handles directing focus here
    />
  ))}
</ScrollView>
```

### Complete Bidirectional Example

```typescript
const MyScreen: React.FC = () => {
  // Track refs for focus navigation
  const [playButtonRef, setPlayButtonRef] = useState<View | null>(null);
  const [firstCastCardRef, setFirstCastCardRef] = useState<View | null>(null);

  return (
    <View style={{ flex: 1 }}>
      {/* Action buttons section */}
      <View style={{ flexDirection: "row", gap: 16 }}>
        <TVButton
          ref={setPlayButtonRef}
          onPress={handlePlay}
          hasTVPreferredFocus  // OK here - this is NOT a focus guide destination
        >
          Play
        </TVButton>
      </View>

      {/* Cast section */}
      <View>
        <Text>Cast</Text>

        {/* BOTH focus guides stacked together, above the list */}
        {/* Downward: Play button → first cast card */}
        {firstCastCardRef && (
          <TVFocusGuideView
            destinations={[firstCastCardRef]}
            style={{ height: 1, width: "100%" }}
          />
        )}
        {/* Upward: cast → Play button */}
        {playButtonRef && (
          <TVFocusGuideView
            destinations={[playButtonRef]}
            style={{ height: 1, width: "100%" }}
          />
        )}

        {/* Use ScrollView, not FlatList, for reliable focus */}
        <ScrollView horizontal style={{ overflow: "visible" }}>
          {cast.map((person, index) => (
            <CastCard
              key={person.id}
              person={person}
              refSetter={index === 0 ? setFirstCastCardRef : undefined}
              // ⚠️ NO hasTVPreferredFocus here - causes flickering!
            />
          ))}
        </ScrollView>
      </View>
    </View>
  );
};
```

### Key Rules for Bidirectional Navigation

1. **Stack both focus guides together** - Place them adjacent to each other, above the destination list
2. **Do NOT use `hasTVPreferredFocus` on focus guide destinations** - This causes focus flickering
3. **Use ScrollView instead of FlatList** - More reliable focus behavior
4. **Use `useState` for refs, not `useRef`** - Triggers re-renders when refs are set

## Focus Guide Placement

The focus guides should be placed **together** above the destination section:

```
┌─────────────────────────┐
│  Action Buttons         │  ← Source (going down)
│  [Play] [Request]       │     Has hasTVPreferredFocus ✓
└─────────────────────────┘
          ↓
┌─────────────────────────┐
│  TVFocusGuideView       │  ← Downward guide
│  destinations=[card1]   │
├─────────────────────────┤
│  TVFocusGuideView       │  ← Upward guide
│  destinations=[playBtn] │     (stacked together)
└─────────────────────────┘
          ↓
┌─────────────────────────┐
│  Cast Cards (ScrollView)│  ← First card is destination
│  [👤] [👤] [👤] [👤]    │     NO hasTVPreferredFocus ✗
└─────────────────────────┘
```

## Component Pattern with refSetter

For components that need to be focus guide destinations, use a `refSetter` callback prop:

```typescript
interface TVCastCardProps {
  person: { id: number; name: string };
  onPress: () => void;
  refSetter?: (ref: View | null) => void;
}

const TVCastCard: React.FC<TVCastCardProps> = ({
  person,
  onPress,
  refSetter,
}) => {
  return (
    <Pressable
      ref={refSetter}
      onPress={onPress}
      // No hasTVPreferredFocus when this is a focus guide destination
    >
      <Text>{person.name}</Text>
    </Pressable>
  );
};

// Usage
<TVCastCard
  person={person}
  onPress={handlePress}
  refSetter={index === 0 ? setFirstCastCardRef : undefined}
/>
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

5. **Auto focus**: Use `autoFocus` to automatically focus the first focusable child when entering a region:
   ```typescript
   <TVFocusGuideView autoFocus>
     {/* First focusable child will receive focus */}
   </TVFocusGuideView>
   ```

   **Warning**: Don't use `autoFocus` on a wrapper when you also have bidirectional focus guides - it can interfere with upward navigation.

## Common Mistakes

| Mistake | Result | Fix |
|---------|--------|-----|
| Using `nextFocusUp`/`nextFocusDown` props | Doesn't work on tvOS | Use `TVFocusGuideView` |
| Using FlatList for horizontal lists | Focus navigation unreliable | Use ScrollView |
| `hasTVPreferredFocus` on focus guide destination | Focus flickering loop | Remove `hasTVPreferredFocus` from destination |
| Focus guides placed separately | Focus flickering | Stack both guides together |
| Using `useRef` for focus guide refs | Focus guide doesn't update | Use `useState` |

## Reference Implementation

See `components/jellyseerr/tv/TVJellyseerrPage.tsx` for a complete implementation of bidirectional focus navigation between action buttons and a cast list.
