# TV platform conventions

Rules that only apply when the app runs on Apple TV or Android TV. Everything here
was learned the hard way: each rule exists because its absence broke something.

Related deep dives: [tv-modal-guide.md](../tv-modal-guide.md),
[tv-focus-guide.md](../tv-focus-guide.md), [tv-discovery.md](../tv-discovery.md).

## Platform-specific files

Metro is configured to resolve a `.tv.*` extension first, but only when `EXPO_TV=1`
(`metro.config.js`). The codebase deliberately does not rely on that resolution, because
it silently disappears in any build where the variable is not set. Pick the TV variant
explicitly instead.

For a page, branch at the top and return the TV component:

```typescript
// app/login.tsx
import { Platform } from "react-native";
import { Login } from "@/components/login/Login";
import { TVLogin } from "@/components/login/TVLogin";

const LoginPage: React.FC = () => {
  if (Platform.isTV) {
    return <TVLogin />;
  }
  return <Login />;
};

export default LoginPage;
```

For a component, keep the mobile and TV implementations in separate files and require the
TV one behind the same check, the way `components/ItemContent.tsx` does:

```typescript
const ItemContentTV = Platform.isTV
  ? require("./ItemContent.tv").ItemContentTV
  : null;
```

Both naming styles exist in the tree, `MyComponent.tv.tsx` and `TVMyComponent.tsx`. The
suffix is a label, not a resolution mechanism: whichever you pick, the import stays
explicit. TV components use the `TV`-prefixed building blocks (`TVInput`, `TVServerCard`
and friends) which carry the focus handling.

## Design

- No purple accent on TV. Focused states are white, backgrounds and overlays use
  `expo-blur` (`BlurView`).
- Buttons sitting next to each other must have the same size. Uneven neighbours read as
  a rendering bug on a 10 foot screen.

## Typography

Size TV text from `@/constants/TVTypography`. It is not a component: call the
`useScaledTVTypography()` hook and apply the returned sizes (`typography.callout` and
friends) to the shared `Text` component, the way `components/tv/TVPosterCard.tsx` does.
Never hardcode font sizes on TV.

## Spacing and focus scale

Horizontal padding is `TV_HORIZONTAL_PADDING = 60` (the old `TV_SCALE_PADDING = 20` is
gone).

Focusable items in tables, rows, columns and lists need room around them: the focus
animation scales roughly 1.05x and clips against a tight parent. Use
`overflow: "visible"` on containers and pad enough that the scaled item still fits.

## Modals

Never use React Native's `Modal` component, nor an overlay or absolutely positioned view,
for a full screen modal on TV. Use the navigation based pattern: a Jotai atom plus
`router.push()`. See [tv-modal-guide.md](../tv-modal-guide.md) for the full pattern,
including dropdowns, bottom sheets and overlay focus management.

## Lists and focus flicker between zones

A page with several focusable zones (a filter bar above a grid, for instance) can make
the TV focus engine flicker rapidly between elements. This is a known React Native TV
issue. Four rules keep it away:

1. **Use `FlatList`, not `FlashList`.** FlashList has known focus problems on TV.

   ```typescript
   {Platform.isTV ? (
     <FlatList data={items} renderItem={renderTVItem} removeClippedSubviews={false} />
   ) : (
     <FlashList data={items} renderItem={renderItem} />
   )}
   ```

2. **Set `removeClippedSubviews={false}`.** Otherwise off screen items unmount and focus
   falls through to unrelated elements.
3. **Exactly one element gets `hasTVPreferredFocus`.** Two elements competing for the
   initial focus is the flicker. Usually the first filter button, not a list item.
4. **Keep the header or filter bar outside the list.** Render it as a sibling `View`
   above the `FlatList` rather than as `ListHeaderComponent`, and do not wrap it in a
   `ScrollView`: two scrollable containers fight over focus.

Reference implementation: `app/(auth)/(tabs)/(libraries)/[libraryId].tsx`.

## Focus guides for non adjacent sections

When focus has to travel between sections that are not geometrically aligned (left
aligned buttons to a horizontal `ScrollView`, say), use `TVFocusGuideView` with
`destinations`:

```typescript
// 1. Track the destination with useState, NOT useRef: a ref never re-renders.
const [firstCardRef, setFirstCardRef] = useState<View | null>(null);

// 2. Place the invisible guide between the two sections.
{firstCardRef && (
  <TVFocusGuideView destinations={[firstCardRef]} style={{ height: 1, width: "100%" }} />
)}

// 3. The target component forwards its ref.
const MyCard = React.forwardRef<View, Props>((props, ref) => (
  <Pressable ref={ref} {...props} />
));

// 4. The state setter is the callback ref of the first item.
{items.map((item, index) => (
  <MyCard ref={index === 0 ? setFirstCardRef : undefined} />
))}
```

Bidirectional navigation and the rest of the API live in
[tv-focus-guide.md](../tv-focus-guide.md). Reference implementation:
`components/ItemContent.tv.tsx`.

## Parity with mobile

A fix that is not purely visual applies to both phone and TV. When you change playback,
reporting, settings resolution or any other shared behaviour, carry it to the TV surface
in the same PR, and say so in the description.
