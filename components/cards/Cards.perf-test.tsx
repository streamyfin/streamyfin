import { getDefaultStore } from "jotai";
import { Card } from "@/components/cards/Card";
import { buildItemCards, type CardKind } from "@/components/cards/CardData";
import { CardListRow } from "@/components/cards/CardListRow";
import { CardRow } from "@/components/cards/CardRow";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeItems } from "@/test-utils/baseItems";
import { measureParentRerenders } from "@/test-utils/rerender";

const KINDS: CardKind[] = ["wide", "portrait", "rowWide"];
const api = getDefaultStore().get(apiAtom);
const noop = () => {};

describe.each(KINDS)("%s cards", (kind) => {
  const items = makeItems(20);
  const [card] = buildItemCards(items, { api, kind });

  test("a CardRow re-renders when its parent updates", async () => {
    await measureParentRerenders(() => (
      <CardRow items={items} kind={kind} title='Row' />
    ));
  });

  test("a Card re-renders when its parent updates", async () => {
    await measureParentRerenders(() => (
      <Card card={card} kind={kind} onPress={noop} />
    ));
  });

  test("a CardListRow re-renders when its parent updates", async () => {
    await measureParentRerenders(() => (
      <CardListRow card={card} kind={kind} onPress={noop} />
    ));
  });
});
