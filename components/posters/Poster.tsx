import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { View } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getCustomHeaders } from "@/utils/jellyfin/jellyfin";

type PosterProps = {
  id?: string | null;
  url?: string | null;
  showProgress?: boolean;
  blurhash?: string | null;
};

const Poster: React.FC<PosterProps> = ({ id, url, blurhash }) => {
  const api = useAtomValue(apiAtom);
  const customHeaders = useMemo(
    () => (api?.basePath ? getCustomHeaders(api.basePath) : {}),
    [api?.basePath],
  );
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
                headers:
                  Object.keys(customHeaders).length > 0
                    ? customHeaders
                    : undefined,
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
