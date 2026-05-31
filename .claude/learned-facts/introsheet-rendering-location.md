# IntroSheet Rendering Location

**Date**: 2025-01-09
**Category**: navigation
**Key files**: `providers/IntroSheetProvider`, `components/IntroSheet`

## Detail

The `IntroSheet` component is rendered inside `IntroSheetProvider` which wraps the entire navigation stack. Any hooks in IntroSheet that interact with navigation state can affect the native bottom tabs.
