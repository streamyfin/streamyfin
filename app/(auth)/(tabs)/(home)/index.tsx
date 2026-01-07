import { useSettings } from "@/utils/atoms/settings";
import { Home } from "../../../../components/home/Home";
import { HomeWithCarousel } from "../../../../components/home/HomeWithCarousel";

const Index = () => {
  const { settings } = useSettings();
  const showLargeHomeCarousel = settings.showLargeHomeCarousel ?? false;

  if (showLargeHomeCarousel) {
    return <HomeWithCarousel />;
  }

  return <Home />;
};

export default Index;
