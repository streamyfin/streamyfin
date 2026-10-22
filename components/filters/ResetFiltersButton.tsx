import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, type TouchableOpacityProps } from "react-native";
import { useFilterReset } from "@/hooks/useFilterReset";
import type { LibraryKind } from "@/utils/library/libraryFilterSets";

interface Props extends TouchableOpacityProps {
  libraryId: string;
  kind: LibraryKind;
}

export const ResetFiltersButton: React.FC<Props> = ({
  libraryId,
  kind,
  ...props
}) => {
  const { hasActiveFilters, resetAllFilters } = useFilterReset(libraryId, kind);

  if (!hasActiveFilters) {
    return null;
  }

  return (
    <TouchableOpacity
      className='bg-purple-600 rounded-full w-[30px] h-[30px] flex items-center justify-center mr-1'
      {...props}
      // After the spread so a forwarded onPress can't disable the reset.
      onPress={resetAllFilters}
    >
      <Ionicons name='close' size={20} color='white' />
    </TouchableOpacity>
  );
};
