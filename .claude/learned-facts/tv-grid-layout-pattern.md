# TV Grid Layout Pattern

**Date**: 2026-01-25
**Category**: tv
**Key files**: `components/tv/`

## Detail

For TV grids, use ScrollView with flexWrap instead of FlatList/FlashList with numColumns. FlatList's numColumns divides width evenly among columns which causes inconsistent item sizing. Use `flexDirection: "row"`, `flexWrap: "wrap"`, `justifyContent: "center"`, and `gap` for spacing.
