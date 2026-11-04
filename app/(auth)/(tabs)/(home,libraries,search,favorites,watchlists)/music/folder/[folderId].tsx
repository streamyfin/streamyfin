import { useLocalSearchParams, useNavigation } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useEffect } from "react";
import { Platform } from "react-native";
import { MusicFolderContents } from "@/components/music/MusicFolderContents";

/** A folder opened from the Folders tab of a music library. */
export default function MusicFolderScreen() {
  const { folderId, name } = useLocalSearchParams<{
    folderId: string;
    name?: string;
  }>();
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();

  useEffect(() => {
    navigation.setOptions({ title: name ?? "" });
  }, [navigation, name]);

  return (
    <MusicFolderContents
      folderId={folderId}
      // The header is transparent on iOS and the list scrolls under it.
      topInset={Platform.OS === "ios" ? headerHeight : 0}
    />
  );
}
