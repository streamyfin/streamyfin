import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useEffect, useState } from "react";
import { getIntros } from "@/utils/intros";

interface UseIntroPlaybackProps {
  api: Api | null;
  itemId: string | null;
  userId?: string;
}

export function useIntroPlayback({
  api,
  itemId,
  userId,
}: UseIntroPlaybackProps) {
  const [intros, setIntros] = useState<BaseItemDto[]>([]);
  const [isPlayingIntro, setIsPlayingIntro] = useState(false);

  useEffect(() => {
    async function fetchIntros() {
      if (!api || !itemId) return;

      const introItems = await getIntros(api, itemId, userId);
      setIntros(introItems);
      // Set isPlayingIntro to true when intros are available
      setIsPlayingIntro(introItems.length > 0);
    }

    fetchIntros();
  }, [api, itemId, userId]);

  // Only play the first intro if intros are available.. might be nice to configure this at some point with tags or something 🤷‍♂️
  const currentIntro = intros.length > 0 ? intros[0] : null;

  const skipAllIntros = () => {
    setIsPlayingIntro(false);
  };

  return {
    intros,
    currentIntro,
    isPlayingIntro,
    skipAllIntros,
  };
}
