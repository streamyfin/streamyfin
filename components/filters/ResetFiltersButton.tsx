import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, type TouchableOpacityProps } from "react-native";
import { useFilterReset } from "@/hooks/useFilterReset";

interface Props extends TouchableOpacityProps {
  libraryId: string;
}

export const ResetFiltersButton: React.FC<Props> = ({
  libraryId,
  ...props
}) => {
  const { hasActiveFilters, resetAllFilters } = useFilterReset(libraryId);

  if (!hasActiveFilters) {
    return null;
  }

  return (
    <TouchableOpacity
      onPress={resetAllFilters}
      className='bg-purple-600 rounded-full w-[30px] h-[30px] flex items-center justify-center mr-1'
      {...props}
    >
      <Ionicons name='close' size={20} color='white' />
    </TouchableOpacity>
  );
};
