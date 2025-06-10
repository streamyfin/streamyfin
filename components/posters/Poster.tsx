import { Image } from "expo-image";
import { View } from "react-native";

type PosterProps = {
  id?: string | null;
  url?: string | null;
  showProgress?: boolean;
  blurhash?: string | null;
};

const Poster: React.FC<PosterProps> = ({ id, url, blurhash }) => {
  if (!id && !url)
    return (
      <View
        className='border border-neutral-900'
        style={{
          aspectRatio: "10/15",
        }}
      />
    );

  return (
    <View className='rounded-lg overflow-hidden border border-neutral-900'>
      <Image
        placeholder={
          blurhash
            ? {
                blurhash,
              }
            : null
        }
        key={id}
        id={id!}
        source={
          url
            ? {
                uri: url,
              }
            : null
        }
        cachePolicy={"memory-disk"}
        contentFit='cover'
        style={{
          aspectRatio: "10/15",
        }}
      />
    </View>
  );
};

export default Poster;
