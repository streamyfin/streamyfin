import { useLocalSearchParams } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { MusicFolderContents } from "@/components/music/MusicFolderContents";

/** The library's top folders, as they are on disk. */
export default function FoldersScreen() {
  const localParams = useLocalSearchParams<{ libraryId?: string | string[] }>();
  const route = useRoute<any>();
  const libraryId =
    (Array.isArray(localParams.libraryId)
      ? localParams.libraryId[0]
      : localParams.libraryId) ?? route?.params?.libraryId;

  return <MusicFolderContents folderId={libraryId} />;
}
