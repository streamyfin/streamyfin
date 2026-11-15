import { MoreMenu } from "@/components/more/MoreMenu";

// A TV build has no More tab: its bar has room for every section
// (utils/tvTabs.ts).
export default function MoreScreen() {
  return <MoreMenu />;
}
