import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useRouter } from "expo-router";
import { View, ViewProps } from "react-native";
import { SongsListItem } from "./SongsListItem";

interface Props extends ViewProps {
  songs?: BaseItemDto[] | null;
  collectionId: string;
  artistId: string;
  albumId: string;
}

export const SongsList: React.FC<Props> = ({
  collectionId,
  artistId,
  albumId,
  songs = [],
  ...props
}) => {
  const router = useRouter();
  return (
    <View className="flex flex-col space-y-2" {...props}>
      {songs?.map((item: BaseItemDto, index: number) => (
        <SongsListItem
          key={item.Id}
          item={item}
          index={index}
          collectionId={collectionId}
          artistId={artistId}
          albumId={albumId}
        />
      ))}
    </View>
  );
};
