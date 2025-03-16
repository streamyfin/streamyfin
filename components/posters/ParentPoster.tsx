import { apiAtom } from "@/providers/JellyfinProvider";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { View } from "react-native";

type PosterProps = {
  id?: string;
  showProgress?: boolean;
};

const ParentPoster: React.FC<PosterProps> = ({ id }) => {
  const [api] = useAtom(apiAtom);

  const url = useMemo(
    () => `${api?.basePath}/Items/${id}/Images/Primary`,
    [id],
  );

  if (!url || !id)
    return (
      <View
        className='border border-neutral-900'
        style={{
          aspectRatio: "10/15",
        }}
      ></View>
    );

  return (
    <View className='rounded-lg overflow-hidden border border-neutral-900'>
      <Image
        key={id}
        id={id}
        source={{
          uri: url,
        }}
        cachePolicy={"memory-disk"}
        contentFit='cover'
        style={{
          aspectRatio: "10/15",
        }}
      />
    </View>
  );
};

export default ParentPoster;
