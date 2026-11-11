import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Linking, Platform } from "react-native";
import { toast } from "sonner-native";
import { ListGroup } from "@/components/list/ListGroup";
import { ListItem } from "@/components/list/ListItem";
import { useMenuLinks } from "@/hooks/useMenuLinks";
import { openCustomLink } from "@/utils/customLinks";

const WebBrowser = !Platform.isTV ? require("expo-web-browser") : null;

/**
 * The server's custom links, one row each in the More menu. Phone only: a TV
 * has no browser to hand a link to. Spec: utils/customLinks.test.tsx.
 */
export const CustomLinksGroup: React.FC = () => {
  const { t } = useTranslation();
  const { data: links = [], isError, isFetching, refetch } = useMenuLinks();

  const openLink = useCallback(
    async (url: unknown) => {
      const opened = await openCustomLink(url, {
        browser: (address) => WebBrowser.openBrowserAsync(address),
        system: (address) => Linking.openURL(address),
      });
      // A tap that does nothing reads as a broken app, when it is the address
      // the admin entered that nothing can open.
      if (!opened) toast.error(t("custom_links.could_not_open_link"));
    },
    [t],
  );

  // The load failed with nothing cached. More stays mounted, so without this
  // row the links would stay hidden until the app restarts or the network
  // comes back.
  if (isError && links.length === 0) {
    return (
      <ListGroup title={t("tabs.custom_links")}>
        <ListItem
          icon='refresh'
          title={t("custom_links.load_failed")}
          value={t("home.retry")}
          disabled={isFetching}
          onPress={() => refetch()}
        />
      </ListGroup>
    );
  }

  if (links.length === 0) return null;

  return (
    <ListGroup title={t("tabs.custom_links")}>
      {links.map((link, index) => (
        <ListItem
          // Names come from a file the admin edits by hand: nothing makes
          // them unique.
          key={`${index}-${link.name}`}
          icon='link'
          title={link.name}
          showArrow
          onPress={() => openLink(link.url)}
        />
      ))}
    </ListGroup>
  );
};
