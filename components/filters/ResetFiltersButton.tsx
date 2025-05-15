import {
  genreFilterAtom,
  tagsFilterAtom,
  yearFilterAtom,
} from "@/utils/atoms/filters";
import { Ionicons } from "@expo/vector-icons";
import { useAtom } from "jotai";
import { TouchableOpacity, type TouchableOpacityProps } from "react-native";

interface Props extends TouchableOpacityProps {}

export const ResetFiltersButton: React.FC<Props> = ({ ...props }) => {
  const [selectedGenres, setSelectedGenres] = useAtom(genreFilterAtom);
  const [selectedTags, setSelectedTags] = useAtom(tagsFilterAtom);
  const [selectedYears, setSelectedYears] = useAtom(yearFilterAtom);

  if (
    selectedGenres.length === 0 &&
    selectedTags.length === 0 &&
    selectedYears.length === 0
  ) {
    return null;
  }

  return (
    <TouchableOpacity
      onPress={() => {
        setSelectedGenres([]);
        setSelectedTags([]);
        setSelectedYears([]);
      }}
      className='bg-purple-600 rounded-full w-[30px] h-[30px] flex items-center justify-center mr-1'
      {...props}
    >
      <Ionicons name='close' size={20} color='white' />
    </TouchableOpacity>
  );
};
