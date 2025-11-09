import { useSettings } from "@/utils/atoms/settings";
import { Home } from "./Home";
import { HomeWithCarousel } from "./HomeWithCarousel";

export const HomeIndex = () => {
  const { settings } = useSettings();
  const showLargeHomeCarousel = settings.showLargeHomeCarousel ?? false;

  if (showLargeHomeCarousel) {
    return <HomeWithCarousel />;
  }

  return <Home />;
};
