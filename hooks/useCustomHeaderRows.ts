import { useCallback, useRef } from "react";
import type { CustomHeader } from "@/utils/customHeaders";

const createRowId = () =>
  `header-${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface UseCustomHeaderRowsProps {
  headers: CustomHeader[];
  /** Every keystroke; keeps the owner's state in sync without persisting. */
  onChange: (headers: CustomHeader[]) => void;
  /** Persist: structural edits, and blur after an actual edit. */
  onCommit?: (headers: CustomHeader[]) => void;
}

/**
 * The row bookkeeping behind the header editors — stable React keys, the edit
 * operations, and when a change is persisted. Shared by the mobile
 * `CustomHeaderList` and `TVCustomHeaderEditor`, which differ only in how a row
 * is drawn.
 */
export function useCustomHeaderRows({
  headers,
  onChange,
  onCommit,
}: UseCustomHeaderRowsProps) {
  // Rows are identified by position, which changes as rows are added and
  // removed; a parallel id list keeps React keys stable across those edits.
  const rowIdsRef = useRef<string[]>([]);
  while (rowIdsRef.current.length < headers.length) {
    rowIdsRef.current.push(createRowId());
  }
  if (rowIdsRef.current.length > headers.length) {
    rowIdsRef.current = rowIdsRef.current.slice(0, headers.length);
  }

  // Committing writes every value to the Keychain and invalidates every cached
  // header, so a blur that follows no edit — tabbing through the fields — must
  // not trigger one.
  const dirtyRef = useRef(false);

  const commit = useCallback(
    (next: CustomHeader[]) => {
      dirtyRef.current = false;
      onCommit?.(next);
    },
    [onCommit],
  );

  const updateRow = useCallback(
    (index: number, updates: Partial<CustomHeader>, commitNow = false) => {
      const next = headers.map((header, i) =>
        i === index ? { ...header, ...updates } : header,
      );
      onChange(next);
      if (commitNow) commit(next);
      else dirtyRef.current = true;
    },
    [headers, onChange, commit],
  );

  const replaceRows = useCallback(
    (next: CustomHeader[]) => {
      rowIdsRef.current = next.map(
        (_, index) => rowIdsRef.current[index] ?? createRowId(),
      );
      onChange(next);
      commit(next);
    },
    [onChange, commit],
  );

  /** Removes one row, or the whole group a preset's rows form. */
  const removeRows = useCallback(
    (indices: number[]) => {
      const dropped = new Set(indices);
      rowIdsRef.current = rowIdsRef.current.filter((_, i) => !dropped.has(i));
      const next = headers.filter((_, i) => !dropped.has(i));
      onChange(next);
      commit(next);
    },
    [headers, onChange, commit],
  );

  const removeRow = useCallback(
    (index: number) => removeRows([index]),
    [removeRows],
  );

  /** Applies the same change to every row of a group (enable/disable). */
  const updateRows = useCallback(
    (indices: number[], updates: Partial<CustomHeader>, commitNow = false) => {
      const touched = new Set(indices);
      const next = headers.map((header, i) =>
        touched.has(i) ? { ...header, ...updates } : header,
      );
      onChange(next);
      if (commitNow) commit(next);
      else dirtyRef.current = true;
    },
    [headers, onChange, commit],
  );

  const appendRows = useCallback(
    (added: CustomHeader[]) => {
      rowIdsRef.current.push(...added.map(() => createRowId()));
      const next = [...headers, ...added];
      onChange(next);
      commit(next);
    },
    [headers, onChange, commit],
  );

  const commitIfEdited = useCallback(() => {
    if (dirtyRef.current) commit(headers);
  }, [headers, commit]);

  return {
    rowIds: rowIdsRef.current,
    updateRow,
    updateRows,
    removeRow,
    removeRows,
    appendRows,
    replaceRows,
    commitIfEdited,
  };
}
