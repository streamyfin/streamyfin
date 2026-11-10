import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { TVGuideProgramCell } from "./TVGuideProgramCell";

interface TVGuideChannelRowProps {
  programs: BaseItemDto[];
  baseTime: Date;
  pixelsPerHour: number;
  minProgramWidth: number;
  hoursToShow: number;
  onProgramPress: (program: BaseItemDto) => void;
  disabled?: boolean;
  firstProgramRefSetter?: (ref: View | null) => void;
}

export const TVGuideChannelRow: React.FC<TVGuideChannelRowProps> = ({
  programs,
  baseTime,
  pixelsPerHour,
  minProgramWidth,
  hoursToShow,
  onProgramPress,
  disabled = false,
  firstProgramRefSetter,
}) => {
  const isCurrentlyAiring = (program: BaseItemDto): boolean => {
    if (!program.StartDate || !program.EndDate) return false;
    const now = new Date();
    const start = new Date(program.StartDate);
    const end = new Date(program.EndDate);
    return now >= start && now <= end;
  };

  const getTimeOffset = (startDate: string): number => {
    const start = new Date(startDate);
    const diffMinutes = (start.getTime() - baseTime.getTime()) / 60000;
    return Math.max(0, (diffMinutes / 60) * pixelsPerHour);
  };

  // Filter programs for this channel and within the time window
  const filteredPrograms = useMemo(() => {
    const endTime = new Date(baseTime.getTime() + hoursToShow * 60 * 60 * 1000);

    return programs
      .filter((p) => {
        if (!p.StartDate || !p.EndDate) return false;
        const start = new Date(p.StartDate);
        const end = new Date(p.EndDate);
        // Program overlaps with our time window
        return end > baseTime && start < endTime;
      })
      .sort((a, b) => {
        const dateA = new Date(a.StartDate || 0);
        const dateB = new Date(b.StartDate || 0);
        return dateA.getTime() - dateB.getTime();
      });
  }, [programs, baseTime, hoursToShow]);

  // Calculate program cells with positions (absolute positioning)
  const programCells = useMemo(() => {
    const cells = filteredPrograms.map((program) => {
      if (!program.StartDate || !program.EndDate) {
        return { program, width: minProgramWidth, left: 0 };
      }

      // Clamp the start time to baseTime if program started earlier
      const programStart = new Date(program.StartDate);
      const effectiveStart = programStart < baseTime ? baseTime : programStart;

      // Clamp the end time to the window end
      const windowEnd = new Date(
        baseTime.getTime() + hoursToShow * 60 * 60 * 1000,
      );
      const programEnd = new Date(program.EndDate);
      const effectiveEnd = programEnd > windowEnd ? windowEnd : programEnd;

      const durationMinutes =
        (effectiveEnd.getTime() - effectiveStart.getTime()) / 60000;
      const width = Math.max(
        (durationMinutes / 60) * pixelsPerHour - 4,
        minProgramWidth,
      ); // -4 for gap

      const left = getTimeOffset(effectiveStart.toISOString());

      return {
        program,
        width,
        left,
      };
    });
    // The minimum width would push a short program over the next one: a cell
    // ends where the next program starts.
    return cells.map((cell, index) => {
      const next = cells[index + 1];
      if (!next || cell.left + cell.width + 4 <= next.left) return cell;
      return { ...cell, width: Math.max(next.left - cell.left - 4, 0) };
    });
  }, [filteredPrograms, baseTime, pixelsPerHour, minProgramWidth, hoursToShow]);

  const totalWidth = hoursToShow * pixelsPerHour;

  return (
    <View style={[styles.container, { width: totalWidth }]}>
      {/* Rendered last to first, so each cell is drawn over the ones after it
          and a focused cell can grow over them. A zIndex would do the same,
          but changing it re-inserts the focused view, and tvOS then loses
          focus and searches for it again. */}
      {programCells
        .map((cell, index) => ({ ...cell, index }))
        .reverse()
        .map(({ program, width, left, index }) => (
          <TVGuideProgramCell
            key={program.Id || index}
            program={program}
            left={left}
            width={width}
            isCurrentlyAiring={isCurrentlyAiring(program)}
            onPress={() => onProgramPress(program)}
            disabled={disabled}
            refSetter={index === 0 ? firstProgramRefSetter : undefined}
            roomToRowEnd={totalWidth - left - 4}
          />
        ))}

      {/* Empty state */}
      {programCells.length === 0 && (
        <View style={[styles.noPrograms, { width: totalWidth - 8 }]}>
          {/* Empty row indicator */}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 80,
    position: "relative",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "rgba(20, 20, 20, 1)",
  },
  noPrograms: {
    position: "absolute",
    left: 4,
    top: 4,
    bottom: 4,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 8,
  },
});
