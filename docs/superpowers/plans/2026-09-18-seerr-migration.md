# Plan d'implémentation de la migration jellyseerr vers seerr

> **Pour un exécutant :** utiliser la skill `superpowers:executing-plans` pour dérouler ce
> plan tâche par tâche. Les étapes sont des cases à cocher.

**But :** sortir l'app Streamyfin du sous-module `utils/jellyseerr` et renommer jellyseerr
en seerr partout, sans perdre de qualité de typage.

**Architecture :** trois couches dans `utils/seerr/`. Les types générés depuis la spec
OpenAPI épinglée de Seerr, une couche tenue à la main pour ce que la spec ne peut pas
donner, et les tables de données de l'interface web. Un test de contrat, qui tourne sans
réseau, confronte des empreintes de forme relevées sur un vrai serveur aux schémas
déclarés.

**Outillage :** Bun, TypeScript, Biome, `bun test`, `openapi-typescript`, GitHub Actions.

**Spec :** `docs/superpowers/specs/2026-09-18-seerr-migration-design.md`

## Contraintes générales

- **Bun uniquement**, jamais `npx` ni yarn. Les scripts s'exécutent par `bun run`.
- Code, identifiants et commentaires **en anglais**. Les documents `.md` en français.
- Les commentaires sont ciblés : un commentaire explique un choix non évident, pas ce que
  la ligne fait déjà voir.
- Les constantes vivent dans `constants.ts`, pas en littéraux dispersés.
- i18n : toucher **uniquement** `translations/en.json`, une clé par phrase entière.
- Chaque changement de code arrive avec ses tests.
- `bun run test` doit passer avant chaque commit : il enchaîne typecheck, tests unitaires,
  Biome et la vérification des clés i18n.
- Les doubles de test partagés vivent dans `test-utils/`. Ne jamais poser un
  `mock.module("@/utils/mmkv")` local dans un spec : `mock.module` est global dans Bun et
  un double par spec rend la suite rouge selon l'ordre des fichiers.
- Cinq PRs empilées sur la branche `seerr-migration`, une par tâche majeure. Ne jamais
  passer `--delete-branch` en mergeant tant qu'une PR est empilée sur la branche.
- `/code-review` au niveau maximum, en ligne, sur chaque PR avant de la pousser.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `scripts/seerr/generate-types.ts` | Télécharge la spec épinglée, écrit `api.d.ts`, `api-shapes.json` et l'empreinte |
| `scripts/seerr/capture.ts` | Relève des empreintes de forme sur un vrai serveur |
| `scripts/seerr/shape.ts` | La fonction qui réduit une valeur JSON à sa forme, partagée par la capture et le test |
| `utils/seerr/generated/pin.json` | Dépôt, tag et sha256 de la spec |
| `utils/seerr/generated/api.d.ts` | Types générés. Jamais édité à la main |
| `utils/seerr/generated/api-shapes.json` | Noms de propriétés déclarés, par route, pour le test de contrat |
| `utils/seerr/corrections.ts` | Les écarts connus de la spec, avec leur date de mesure |
| `utils/seerr/types.ts` | Les types que l'app consomme : alias, enums, unions, corrections |
| `utils/seerr/data.ts` | `networks`, `studios`, `genreColorMap`, constantes de l'interface web |
| `utils/seerr/permissions.ts` | `Permission` et `hasPermission`, portés depuis l'amont |
| `utils/seerr/__fixtures__/*.json` | Empreintes de forme, clés et types seulement |
| `utils/seerr/contract.test.ts` | Confronte empreintes, schémas déclarés et corrections |
| `.github/workflows/seerr-spec.yml` | Rafraîchissement hebdomadaire, ouvre une PR |

---

## PR 1 : le générateur et son workflow

Rien d'existant n'est touché. Personne ne consomme encore ce que cette PR produit.

### Tâche 1 : l'empreinte et le téléchargement de la spec

**Fichiers :**
- Créer : `scripts/seerr/generate-types.ts`
- Créer : `utils/seerr/generated/pin.json`
- Test : `scripts/seerr/generate-types.test.ts`

**Interfaces :**
- Produit : `readPin(): Pin`, `pinUrl(pin: Pin): string`, `fingerprint(text: string): string`
  où `Pin = { repo: string; ref: string; sha256: string }`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, expect, test } from "bun:test";
import { fingerprint, pinUrl } from "./generate-types";

describe("the pinned spec", () => {
  test("is fetched from the ref the pin names", () => {
    expect(pinUrl({ repo: "seerr-team/seerr", ref: "v3.4.1", sha256: "" })).toBe(
      "https://raw.githubusercontent.com/seerr-team/seerr/v3.4.1/seerr-api.yml",
    );
  });

  test("is fingerprinted so a hand edit shows up", () => {
    expect(fingerprint("openapi: 3.0.2\n")).toBe(
      "c3c9ba9a2d53f1a92ad1a9d3dbbea6ad3f68e2d0d6b0b3eb2e8e5c4b0ee36a0f",
    );
  });
});
```

La valeur attendue de l'empreinte se calcule une fois avec
`bun -e 'console.log(new Bun.CryptoHasher("sha256").update("openapi: 3.0.2\n").digest("hex"))'`
et se recopie dans le test. Ne pas recalculer l'empreinte dans le test, sinon il ne teste
plus rien.

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `bun test scripts/seerr/generate-types.test.ts`
Attendu : échec, `Export named 'fingerprint' not found`.

- [ ] **Étape 3 : écrire le minimum**

```ts
export interface Pin {
  /** The repository the spec is published from. */
  repo: string;
  /** A tag, so the generated types never move under us. */
  ref: string;
  /** Of the spec source, so a hand edit of the generated file shows up. */
  sha256: string;
}

export const pinUrl = (pin: Pin): string =>
  `https://raw.githubusercontent.com/${pin.repo}/${pin.ref}/seerr-api.yml`;

export const fingerprint = (text: string): string =>
  new Bun.CryptoHasher("sha256").update(text).digest("hex");
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `bun test scripts/seerr/generate-types.test.ts`
Attendu : 2 pass.

- [ ] **Étape 5 : écrire l'épingle**

`utils/seerr/generated/pin.json` :

```json
{
  "repo": "seerr-team/seerr",
  "ref": "v3.4.1",
  "sha256": ""
}
```

Le `sha256` vide est rempli par la première génération.

- [ ] **Étape 6 : commit**

```bash
git add scripts/seerr/generate-types.ts scripts/seerr/generate-types.test.ts utils/seerr/generated/pin.json
git commit -m "feat(seerr): pin the OpenAPI spec and fingerprint it"
```

### Tâche 2 : la génération des types et des formes déclarées

**Fichiers :**
- Modifier : `scripts/seerr/generate-types.ts`
- Modifier : `scripts/seerr/generate-types.test.ts`
- Modifier : `package.json` (script `seerr:types`)

**Interfaces :**
- Consomme : `Pin`, `pinUrl`, `fingerprint` de la tâche 1.
- Produit : `declaredShapes(spec: OpenApiDocument): Record<string, string[]>`, où la clé est
  `"GET /user"` et la valeur la liste des chemins de propriétés déclarés, aplatis en
  `"pageInfo.pageSize"` et `"results[].email"`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
test("flattens a declared response into property paths", () => {
  const spec = {
    paths: {
      "/user": {
        get: {
          responses: {
            "200": {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      pageInfo: {
                        type: "object",
                        properties: { page: { type: "number" } },
                      },
                      results: {
                        type: "array",
                        items: { $ref: "#/components/schemas/User" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        User: { type: "object", properties: { id: { type: "number" } } },
      },
    },
  };

  expect(declaredShapes(spec)).toEqual({
    "GET /user": ["pageInfo", "pageInfo.page", "results", "results[]", "results[].id"],
  });
});

test("stops at a schema that refers to itself", () => {
  const spec = {
    paths: {
      "/a": {
        get: {
          responses: {
            "200": {
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/Node" } },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Node: {
          type: "object",
          properties: { child: { $ref: "#/components/schemas/Node" } },
        },
      },
    },
  };

  expect(declaredShapes(spec)["GET /a"]).toEqual(["child"]);
});
```

Le second test est là parce que `MediaInfo` et `MediaRequest` se référencent l'un l'autre
dans la vraie spec : sans garde, la traversée ne termine pas.

- [ ] **Étape 2 : lancer le test et vérifier qu'il échoue**

Lancer : `bun test scripts/seerr/generate-types.test.ts`
Attendu : échec, `declaredShapes is not a function`.

- [ ] **Étape 3 : écrire l'implémentation**

```ts
type Schema = Record<string, unknown>;

/**
 * The property paths one response declares, flattened.
 *
 * The contract test compares these against what a real server actually sends,
 * so the shape has to be a flat list of names rather than a schema: it is
 * compared, not validated.
 */
export const declaredShapes = (spec: Schema): Record<string, string[]> => {
  const schemas = ((spec.components as Schema)?.schemas ?? {}) as Record<string, Schema>;

  // A schema may refer to itself, directly or through a neighbour. The names
  // already on the path are refused rather than the paths already walked,
  // so a type reached twice by different routes is still described twice.
  const deref = (node: Schema | undefined, seen: string[]): [Schema | undefined, string[]] => {
    let current = node;
    let names = seen;
    while (current && typeof current.$ref === "string") {
      const name = current.$ref.split("/").pop() as string;
      if (names.includes(name)) return [undefined, names];
      names = [...names, name];
      current = schemas[name];
    }
    return [current, names];
  };

  const walk = (node: Schema | undefined, prefix: string, seen: string[]): string[] => {
    const [resolved, names] = deref(node, seen);
    if (!resolved) return [];

    if (Array.isArray(resolved.allOf)) {
      return (resolved.allOf as Schema[]).flatMap((part) => walk(part, prefix, names));
    }

    if (resolved.type === "array") {
      const inner = `${prefix}[]`;
      return [inner, ...walk(resolved.items as Schema, inner, names)];
    }

    const properties = resolved.properties as Record<string, Schema> | undefined;
    if (!properties) return [];

    return Object.entries(properties).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return [path, ...walk(value, path, names)];
    });
  };

  const out: Record<string, string[]> = {};
  for (const [route, item] of Object.entries((spec.paths ?? {}) as Record<string, Schema>)) {
    for (const [method, operation] of Object.entries(item)) {
      const responses = (operation as Schema).responses as Record<string, Schema> | undefined;
      const ok = Object.entries(responses ?? {}).find(([code]) => code.startsWith("2"));
      const body = (ok?.[1].content as Schema | undefined)?.["application/json"] as
        | Schema
        | undefined;
      if (!body?.schema) continue;
      out[`${method.toUpperCase()} ${route}`] = walk(body.schema as Schema, "", []);
    }
  }
  return out;
};
```

- [ ] **Étape 4 : lancer le test et vérifier qu'il passe**

Lancer : `bun test scripts/seerr/generate-types.test.ts`
Attendu : 4 pass.

- [ ] **Étape 5 : écrire l'entrée du script**

Ajouter, en bas de `scripts/seerr/generate-types.ts` :

```ts
if (import.meta.main) {
  const pin = (await Bun.file("utils/seerr/generated/pin.json").json()) as Pin;
  const source = await fetch(pinUrl(pin)).then((response) => {
    if (!response.ok) throw new Error(`${pinUrl(pin)} answered ${response.status}`);
    return response.text();
  });

  const sha256 = fingerprint(source);
  if (pin.sha256 && pin.sha256 !== sha256) {
    throw new Error(
      `The spec at ${pin.ref} no longer matches the pin. A tag was moved, which is not something to paper over.`,
    );
  }

  await Bun.write("utils/seerr/generated/seerr-api.yml", source);
  await Bun.$`bunx openapi-typescript@7 utils/seerr/generated/seerr-api.yml -o utils/seerr/generated/api.d.ts`;

  const header = `// Generated from ${pin.repo}@${pin.ref}, sha256 ${sha256}.\n// Run \`bun run seerr:types\` rather than editing this file.\n`;
  const generated = await Bun.file("utils/seerr/generated/api.d.ts").text();
  await Bun.write("utils/seerr/generated/api.d.ts", header + generated);

  const spec = parse(source) as Schema; // yaml parser, see step 6
  await Bun.write(
    "utils/seerr/generated/api-shapes.json",
    `${JSON.stringify(declaredShapes(spec), null, 1)}\n`,
  );
  await Bun.write(
    "utils/seerr/generated/pin.json",
    `${JSON.stringify({ ...pin, sha256 }, null, 2)}\n`,
  );
}
```

- [ ] **Étape 6 : ajouter le lecteur de YAML**

`bun add -d yaml` puis `import { parse } from "yaml";` en tête du script. Bun ne lit pas le
YAML nativement, et la spec ne se convertit pas depuis le JSON puisqu'elle est publiée en
YAML.

- [ ] **Étape 7 : ajouter le script au `package.json`**

```json
"seerr:types": "bun run scripts/seerr/generate-types.ts"
```

- [ ] **Étape 8 : générer et vérifier**

Lancer : `bun run seerr:types`
Attendu : `utils/seerr/generated/api.d.ts` créé, autour de 10 500 lignes, l'en-tête porte
l'empreinte, `api-shapes.json` contient 181 entrées, une par opération à corps JSON sur
les 216 déclarées, et `pin.json` porte maintenant son `sha256`.

Vérifier : `bun run typecheck` passe avec le fichier généré dans l'arbre.

- [ ] **Étape 9 : sortir le yaml de l'arbre**

Ajouter `utils/seerr/generated/seerr-api.yml` au `.gitignore` : c'est une source
intermédiaire, l'empreinte suffit à prouver de quoi les types sortent.

- [ ] **Étape 10 : commit**

```bash
git add scripts/seerr/ utils/seerr/generated/ package.json bun.lock .gitignore
git commit -m "feat(seerr): generate the API types from the pinned OpenAPI spec"
```

### Tâche 3 : le workflow de rafraîchissement

**Fichiers :**
- Créer : `.github/workflows/seerr-spec.yml`

- [ ] **Étape 1 : écrire le workflow**

```yaml
name: Seerr spec

on:
  schedule:
    - cron: "0 6 * * 1"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  refresh:
    name: Refresh the pinned spec
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Read the latest release
        id: latest
        run: |
          tag=$(gh release view --repo seerr-team/seerr --json tagName --jq .tagName)
          echo "tag=$tag" >> "$GITHUB_OUTPUT"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Move the pin
        run: |
          bun -e '
            const pin = await Bun.file("utils/seerr/generated/pin.json").json();
            pin.ref = process.env.TAG;
            pin.sha256 = "";
            await Bun.write("utils/seerr/generated/pin.json", JSON.stringify(pin, null, 2) + "\n");
          '
        env:
          TAG: ${{ steps.latest.outputs.tag }}
      - run: bun install --frozen-lockfile
      - run: bun run seerr:types
      - name: Open a pull request when something moved
        uses: peter-evans/create-pull-request@v6
        with:
          branch: chore/seerr-spec-${{ steps.latest.outputs.tag }}
          base: develop
          title: "chore(seerr): spec ${{ steps.latest.outputs.tag }}"
          commit-message: "chore(seerr): regenerate the types from ${{ steps.latest.outputs.tag }}"
          body: |
            Types regenerated from `seerr-team/seerr@${{ steps.latest.outputs.tag }}`.

            Read `utils/seerr/generated/api-shapes.json` in the diff: a route that
            appears or a property that moves shows up there in one line, where the
            generated `api.d.ts` would take a hundred.
```

- [ ] **Étape 2 : vérifier la syntaxe**

Lancer : `bunx yaml-lint .github/workflows/seerr-spec.yml` ou, à défaut,
`bun -e 'import {parse} from "yaml"; parse(await Bun.file(".github/workflows/seerr-spec.yml").text()); console.log("ok")'`
Attendu : `ok`.

Le workflow ne peut pas être prouvé autrement qu'en le lançant : le déclencher à la main
depuis l'onglet Actions après le merge, et vérifier qu'il ne change rien quand l'épingle
est déjà à jour. Un workflow vert sur du code qui ne fait rien ne prouve rien.

- [ ] **Étape 3 : commit et ouverture de la PR 1**

```bash
git add .github/workflows/seerr-spec.yml
git commit -m "ci(seerr): refresh the pinned spec every week"
```

Puis `/code-review` au niveau maximum, traiter les remarques, et ouvrir la PR vers
`seerr-migration`.

---

## PR 2 : la couche tenue à la main

### Tâche 4 : les permissions

**Fichiers :**
- Créer : `utils/seerr/permissions.ts`
- Test : `utils/seerr/permissions.test.ts`

**Interfaces :**
- Produit : `enum Permission`, `hasPermission(permissions: Permission | Permission[], value: number, options?: { type: "and" | "or" }): boolean`.

Le contenu se recopie depuis `server/lib/permissions.ts` de l'amont, 74 lignes, licence
MIT. Garder l'en-tête qui dit d'où ça vient et à quel tag.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, expect, test } from "bun:test";
import { hasPermission, Permission } from "./permissions";

describe("hasPermission", () => {
  test("lets an administrator through whatever is asked", () => {
    expect(hasPermission(Permission.MANAGE_REQUESTS, Permission.ADMIN)).toBe(true);
  });

  test("refuses a permission the user does not hold", () => {
    expect(hasPermission(Permission.MANAGE_REQUESTS, Permission.REQUEST)).toBe(false);
  });

  test("needs every permission when asked for all of them", () => {
    expect(
      hasPermission([Permission.REQUEST, Permission.VOTE], Permission.REQUEST, {
        type: "and",
      }),
    ).toBe(false);
  });

  test("needs only one when asked for any", () => {
    expect(
      hasPermission([Permission.REQUEST, Permission.VOTE], Permission.REQUEST, {
        type: "or",
      }),
    ).toBe(true);
  });
});
```

- [ ] **Étape 2 : lancer et vérifier l'échec**

Lancer : `bun test utils/seerr/permissions.test.ts`
Attendu : échec, module introuvable.

- [ ] **Étape 3 : porter le fichier amont**

Recopier l'enum et la fonction depuis `server/lib/permissions.ts` au tag épinglé, sans
rien changer à la logique. En tête :

```ts
/**
 * Ported from seerr-team/seerr@v3.4.1 server/lib/permissions.ts, MIT.
 *
 * The spec serves `permissions` as a plain number with no values attached, so
 * this cannot be generated. It is a bitmask and a pure function, it has not
 * changed in years, and the contract test tells us the day a new bit appears.
 */
```

- [ ] **Étape 4 : lancer et vérifier le succès**

Lancer : `bun test utils/seerr/permissions.test.ts`
Attendu : 4 pass.

- [ ] **Étape 5 : commit**

```bash
git add utils/seerr/permissions.ts utils/seerr/permissions.test.ts
git commit -m "feat(seerr): port the permission bitmask the spec serves as a number"
```

### Tâche 5 : les enums et les unions

**Fichiers :**
- Créer : `utils/seerr/types.ts`
- Créer : `utils/seerr/corrections.ts`
- Test : `utils/seerr/types.test.ts`

**Interfaces :**
- Consomme : `components` et `paths` de `./generated/api`.
- Produit : `MediaStatus`, `MediaRequestStatus`, `MediaType`, `IssueType`, `IssueStatus`,
  `DiscoverSliderType`, `SearchResult`, `MovieResult`, `TvResult`, `PersonResult`,
  `MovieDetails`, `TvDetails`, `PersonDetails`, `CombinedCredit`, `SeasonWithEpisodes`,
  `MediaRequest`, `MediaRequestBody`, `Issue`, `User`, `DiscoverSlider`, `GenreSliderItem`,
  `RTRating`, `ServiceCommonServer`, `ServiceCommonServerWithDetails`,
  `RequestResultsResponse`, `UserResultsResponse`, `DownloadingItem`, `QualityProfile`,
  `RootFolder`, `Tag`, `TmdbRelease`.
- Produit : `CORRECTIONS`, la liste des écarts connus, lue par le test de contrat.

Les 44 symboles que l'app importe aujourd'hui sont listés dans la spec de conception. Les
types dont un schéma nommé existe deviennent des alias. Les autres se dérivent de la route,
par exemple `paths["/search"]["get"]["responses"][200]["content"]["application/json"]`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, expect, test } from "bun:test";
import { CORRECTIONS } from "./corrections";
import { MediaStatus, MediaType } from "./types";

describe("the values the spec serves as plain numbers", () => {
  test("carry the meanings the spec only writes in prose", () => {
    expect(MediaStatus.AVAILABLE).toBe(5);
    expect(MediaStatus.PARTIALLY_AVAILABLE).toBe(4);
    expect(MediaType.MOVIE).toBe("movie");
  });
});

describe("the corrections", () => {
  test("say what was measured and when, so a stale one can be dropped", () => {
    for (const [route, correction] of Object.entries(CORRECTIONS)) {
      expect(correction.measured, `${route} has no measurement date`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      );
      expect(
        correction.added.length + correction.renamed.length,
        `${route} corrects nothing`,
      ).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Étape 2 : lancer et vérifier l'échec**

Lancer : `bun test utils/seerr/types.test.ts`
Attendu : échec, modules introuvables.

- [ ] **Étape 3 : écrire `corrections.ts`**

```ts
/**
 * Where the published spec does not describe what a server actually sends.
 *
 * Seerr mounts its OpenAPI validator with `validateRequests: true` and nothing
 * on responses, so the response half of the spec is documentation. These
 * entries were measured against a real server, and the contract test reads
 * them: a correction that stops being needed fails the test, which is how we
 * learn the day upstream fixes one.
 */
export interface Correction {
  /** ISO date of the measurement. */
  measured: string;
  /** Property paths the server sends and the spec does not declare. */
  added: string[];
  /** Property paths the spec names differently, spec name to served name. */
  renamed: [string, string][];
  /** Why, in one line. */
  note: string;
}

export const CORRECTIONS: Record<string, Correction> = {
  "GET /settings/public": {
    measured: "2026-09-18",
    added: [
      "applicationTitle",
      "applicationUrl",
      "cacheImages",
      "discoverRegion",
      "emailEnabled",
      "enablePushRegistration",
      "enableSpecialEpisodes",
      "hideAvailable",
      "hideBlocklisted",
      "hideRequested",
      "jellyfinExternalHost",
      "jellyfinForgotPasswordUrl",
      "localLogin",
      "locale",
      "mediaServerLogin",
      "mediaServerType",
      "movie4kEnabled",
      "newPlexLogin",
      "originalLanguage",
      "partialRequestsEnabled",
      "series4kEnabled",
      "streamingRegion",
      "userEmailRequired",
      "vapidPublic",
      "versionCheck",
      "youtubeUrl",
    ],
    renamed: [],
    note: "The handler returns settings.fullPublicSettings, the spec declares PublicSettings.",
  },
  "GET /tv/{tvId}": {
    measured: "2026-09-18",
    added: ["onUserWatchlist", "relatedVideos"],
    renamed: [["numberOfSeason", "numberOfSeasons"]],
    note: "The declared name is a typo, and two fields are missing.",
  },
  // La liste complète se remplit depuis
  // ~/.claude-tmp/streamyfin/seerr-research/findings.json, une entrée par route
  // parmi les 12 mesurées, plus les deux routes à paramètre.
};
```

- [ ] **Étape 4 : écrire `types.ts`**

Les enums se recopient depuis `server/constants/media.ts`, `server/constants/issue.ts` et
`server/constants/discover.ts` de l'amont, avec le même en-tête de provenance que les
permissions. Les alias et les corrections suivent, chacune commentée par sa clé dans
`CORRECTIONS` :

```ts
import type { components, paths } from "./generated/api";

type Json<T> = T extends { content: { "application/json": infer B } } ? B : never;

export type MovieDetails = components["schemas"]["MovieDetails"];

/**
 * See CORRECTIONS["GET /tv/{tvId}"]: the spec declares `numberOfSeason`, the
 * server sends `numberOfSeasons`, and two fields are missing.
 */
export type TvDetails = Omit<components["schemas"]["TvDetails"], "numberOfSeason"> & {
  numberOfSeasons: number;
  onUserWatchlist?: boolean;
  relatedVideos?: components["schemas"]["RelatedVideo"][];
};
```

- [ ] **Étape 5 : lancer et vérifier le succès**

Lancer : `bun test utils/seerr/types.test.ts && bun run typecheck`
Attendu : tests verts, typecheck propre.

- [ ] **Étape 6 : commit**

```bash
git add utils/seerr/types.ts utils/seerr/corrections.ts utils/seerr/types.test.ts
git commit -m "feat(seerr): declare the values and the shapes the spec cannot give"
```

### Tâche 6 : les tables de données de l'interface web

**Fichiers :**
- Créer : `utils/seerr/data.ts`
- Test : `utils/seerr/data.test.ts`

Recopier `networks`, `studios` et `COMPANY_LOGO_IMAGE_FILTER` depuis
`src/components/Discover/NetworkSlider.tsx` et `StudioSlider.tsx`, `genreColorMap` depuis
`src/components/Discover/constants.ts`, et `ANIME_KEYWORD_ID` depuis
`server/api/themoviedb/constants.ts`. En-tête de provenance et licence MIT.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, expect, test } from "bun:test";
import { ANIME_KEYWORD_ID, genreColorMap, networks, studios } from "./data";

describe("the discover tables", () => {
  test("keep every network and studio addressable by id", () => {
    expect(networks.length).toBeGreaterThan(0);
    expect(new Set(networks.map((n) => n.id)).size).toBe(networks.length);
    expect(new Set(studios.map((s) => s.id)).size).toBe(studios.length);
  });

  test("colour every genre the sliders can draw", () => {
    expect(genreColorMap[0]).toHaveLength(2);
  });

  test("keep the anime keyword the app filters on", () => {
    expect(ANIME_KEYWORD_ID).toBe(210024);
  });
});
```

- [ ] **Étape 2 : lancer et vérifier l'échec**

Lancer : `bun test utils/seerr/data.test.ts`

- [ ] **Étape 3 : recopier les tables**

- [ ] **Étape 4 : lancer et vérifier le succès**

- [ ] **Étape 5 : commit puis `/code-review` au niveau maximum, et ouvrir la PR 2**

```bash
git add utils/seerr/data.ts utils/seerr/data.test.ts
git commit -m "feat(seerr): carry the discover tables the web UI owns"
```

---

## PR 3 : la capture et le test de contrat

### Tâche 7 : la réduction d'une réponse à sa forme

**Fichiers :**
- Créer : `scripts/seerr/shape.ts`
- Test : `scripts/seerr/shape.test.ts`

**Interfaces :**
- Produit : `shapeOf(value: unknown, depth?: number): Shape` où
  `type Shape = string | { [key: string]: Shape }`, et un tableau devient `{ "[]": Shape }`.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, expect, test } from "bun:test";
import { shapeOf } from "./shape";

describe("shapeOf", () => {
  test("keeps the keys and the types, never the values", () => {
    expect(shapeOf({ id: 7, title: "Dune", adult: false })).toEqual({
      id: "number",
      title: "string",
      adult: "boolean",
    });
  });

  test("describes an array by its first element", () => {
    expect(shapeOf([{ id: 1 }, { id: 2 }])).toEqual({ "[]": { id: "number" } });
  });

  test("says an empty array is empty rather than guessing", () => {
    expect(shapeOf([])).toBe("array<empty>");
  });

  test("keeps null apart from a missing key", () => {
    expect(shapeOf({ plexUsername: null })).toEqual({ plexUsername: "null" });
  });

  test("stops descending so a deep response cannot blow the fixture up", () => {
    expect(shapeOf({ a: { b: { c: { d: { e: 1 } } } } })).toEqual({
      a: { b: { c: "object" } },
    });
  });
});
```

Le test sur `null` existe parce qu'un champ déclaré non nullable et servi `null` est l'un
des trois types d'écart mesurés, et qu'une forme qui écraserait `null` en `"object"` le
rendrait invisible.

- [ ] **Étape 2 : lancer et vérifier l'échec**

Lancer : `bun test scripts/seerr/shape.test.ts`

- [ ] **Étape 3 : écrire l'implémentation**

```ts
export type Shape = string | { [key: string]: Shape };

/**
 * A response reduced to its keys and the type of each value.
 *
 * No value ever comes out of here: the fixtures live in the repository, and a
 * captured title, address or token would be a leak, not a test.
 */
export const shapeOf = (value: unknown, depth = 0): Shape => {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "array<empty>";
    if (depth >= 3) return "array";
    return { "[]": shapeOf(value[0], depth + 1) };
  }
  if (typeof value === "object") {
    if (depth >= 3) return "object";
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, inner]) => [key, shapeOf(inner, depth + 1)]),
    );
  }
  return typeof value;
};
```

- [ ] **Étape 4 : lancer et vérifier le succès**

Lancer : `bun test scripts/seerr/shape.test.ts`
Attendu : 5 pass.

- [ ] **Étape 5 : commit**

```bash
git add scripts/seerr/shape.ts scripts/seerr/shape.test.ts
git commit -m "feat(seerr): reduce a response to keys and types, never values"
```

### Tâche 8 : la capture

**Fichiers :**
- Créer : `scripts/seerr/capture.ts`
- Créer : `utils/seerr/routes.ts`
- Modifier : `package.json` (script `seerr:capture`)

**Interfaces :**
- Consomme : `shapeOf` de la tâche 7.
- Produit : `APP_ROUTES`, la liste des routes que l'app appelle, en gabarit de spec
  (`"GET /tv/{tvId}/season/{seasonNumber}"`) accompagnée d'un exemple de valeurs de
  paramètres, pour que la capture et le test parlent des mêmes clés.

- [ ] **Étape 1 : écrire la liste des routes**

Les 31 appels sont dans `hooks/useJellyseerr.ts`. Les écrire une fois, en constantes, et
non en littéraux dispersés.

- [ ] **Étape 2 : écrire le script de capture**

Il prend l'adresse et les identifiants dans l'environnement, jamais en arguments, pour
qu'ils ne finissent pas dans un historique de shell :

```ts
const base = process.env.SEERR_URL;
const username = process.env.SEERR_JELLYFIN_USER;
const password = process.env.SEERR_JELLYFIN_PASSWORD;
```

Il ouvre une session par `POST /api/v1/auth/jellyfin` **sans** `hostname` : un serveur déjà
configuré répond 500 « Jellyfin hostname already configured » quand on l'envoie.

Il écrit un fichier par route dans `utils/seerr/__fixtures__/`, contenant le statut et la
forme, et rien d'autre.

- [ ] **Étape 3 : lancer la capture contre un vrai serveur**

Lancer : `SEERR_URL=... SEERR_JELLYFIN_USER=... SEERR_JELLYFIN_PASSWORD=... bun run seerr:capture`
Attendu : un fichier par route jouable, et une ligne par route refusée avec son statut.

Relire les fichiers écrits avant de les ajouter : aucun titre, aucune adresse, aucun
identifiant ne doit s'y trouver. C'est la vérification qui compte le plus de cette tâche.

- [ ] **Étape 4 : commit**

```bash
git add scripts/seerr/capture.ts utils/seerr/routes.ts utils/seerr/__fixtures__/ package.json
git commit -m "feat(seerr): capture response shapes from a real server"
```

### Tâche 9 : le test de contrat

**Fichiers :**
- Créer : `utils/seerr/contract.test.ts`

**Interfaces :**
- Consomme : `api-shapes.json` de la tâche 2, `CORRECTIONS` de la tâche 5, les empreintes de
  la tâche 8.

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
import { describe, expect, test } from "bun:test";
import declared from "./generated/api-shapes.json";
import { CORRECTIONS } from "./corrections";
import { fixtures } from "./__fixtures__";

describe("what a real server sends", () => {
  for (const [route, fixture] of Object.entries(fixtures)) {
    test(`${route} sends nothing we do not know about`, () => {
      const known = new Set([
        ...(declared[route] ?? []),
        ...(CORRECTIONS[route]?.added ?? []),
        ...(CORRECTIONS[route]?.renamed.map(([, served]) => served) ?? []),
      ]);
      const served = pathsOf(fixture.shape);
      expect(served.filter((path) => !known.has(path))).toEqual([]);
    });

    test(`${route} still needs every correction it carries`, () => {
      const served = new Set(pathsOf(fixture.shape));
      const stale = (CORRECTIONS[route]?.added ?? []).filter(
        (path) => declared[route]?.includes(path) && served.has(path),
      );
      expect(stale, "upstream now declares these, drop the correction").toEqual([]);
    });
  }
});
```

Le second test est la partie qui fait rétrécir notre couche avec le temps : le jour où
l'amont déclare un champ qu'on corrigeait, il devient rouge et dit lequel retirer.

- [ ] **Étape 2 : lancer et vérifier l'échec**

Lancer : `bun test utils/seerr/contract.test.ts`
Attendu : échec, `pathsOf is not defined`.

- [ ] **Étape 3 : écrire `pathsOf` et l'index des empreintes**

`pathsOf` aplatit une `Shape` en la même notation que `declaredShapes`, sinon les deux
listes ne se comparent pas. Le même aplatissement des deux côtés est la seule chose qui
rend ce test honnête.

- [ ] **Étape 4 : lancer et vérifier le succès**

Lancer : `bun test utils/seerr/contract.test.ts`
Attendu : vert, avec autant de tests que de routes capturées.

Vérifier que le test attrape vraiment quelque chose : ajouter à la main un champ inventé
dans une empreinte, relancer, constater le rouge, puis l'enlever. Un test de contrat qui
n'a jamais été vu rouge ne prouve rien.

- [ ] **Étape 5 : commit puis `/code-review` au niveau maximum, et ouvrir la PR 3**

```bash
git add utils/seerr/contract.test.ts
git commit -m "test(seerr): check the types against what a real server sends"
```

### Tâche 9 bis : rafraîchir les empreintes quand l'épingle bouge

**Fichiers :**
- Modifier : `.github/workflows/seerr-spec.yml`

C'est le second régime décrit dans la spec, et il ne peut arriver qu'ici : la capture
n'existe qu'à partir de la tâche 8.

- [ ] **Étape 1 : monter les deux serveurs dans le job**

Ajouter, après la régénération des types, un service Jellyfin et un service Seerr, puis un
pas qui câble les deux par l'API : créer l'administrateur Jellyfin par l'assistant, puis
appeler `POST /api/v1/auth/jellyfin` sur Seerr **avec** `hostname`, ce qui crée le premier
compte administrateur côté Seerr.

Aucun secret n'est nécessaire : Seerr embarque sa propre clé TMDB, donc discover et search
répondent sans configuration.

- [ ] **Étape 2 : rejouer la capture et committer les empreintes**

```yaml
      - name: Refresh the fixtures
        run: bun run seerr:capture
        env:
          SEERR_URL: http://localhost:5055
          SEERR_JELLYFIN_USER: contract
          SEERR_JELLYFIN_PASSWORD: ${{ steps.wire.outputs.password }}
```

Le mot de passe est tiré au hasard par le pas de câblage, il ne vit que le temps du job.

- [ ] **Étape 3 : prouver le job**

Le déclencher à la main depuis l'onglet Actions, avec l'épingle volontairement reculée d'une
version, et vérifier que la PR ouverte porte à la fois les types régénérés et les empreintes
rafraîchies. Un workflow qui n'a jamais tourné pour de vrai n'est pas un workflow qui marche.

- [ ] **Étape 4 : commit**

```bash
git add .github/workflows/seerr-spec.yml
git commit -m "ci(seerr): measure the shapes again when the pin moves"
```

---

## PR 4 : la bascule

### Tâche 10 : basculer les imports et retirer le sous-module

**Fichiers :**
- Modifier : les 26 modules qui importent `@/utils/jellyseerr/**`, listés par
  `grep -rl "@/utils/jellyseerr" --include="*.ts" --include="*.tsx" .`
- Supprimer : `utils/jellyseerr` (sous-module), `utils/_jellyseerr`, l'entrée dans
  `.gitmodules`

- [ ] **Étape 1 : rediriger les imports**

Un module à la fois, en commençant par `hooks/useJellyseerr.ts`. Après chaque module,
`bun run typecheck`. Le typecheck est le juge de cette tâche : il dit exactement quel champ
manque, et c'est comme ça qu'on découvre une correction oubliée dans la tâche 5.

- [ ] **Étape 2 : retirer le sous-module**

```bash
git submodule deinit -f utils/jellyseerr
git rm -f utils/jellyseerr
rm -rf .git/modules/utils/jellyseerr
git rm -r utils/_jellyseerr
```

Vérifier qu'il ne reste rien : `grep -rn "utils/jellyseerr" . --exclude-dir=node_modules`
ne doit plus rien sortir, et `.gitmodules` doit avoir disparu s'il ne déclarait que celui
là.

- [ ] **Étape 3 : prouver qu'un clone neuf compile**

```bash
git worktree add ../wt-seerr-check seerr-migration
cd ../wt-seerr-check && bun install && bun run typecheck
```

Attendu : propre, **sans** `git submodule update --init`. C'est le résultat que toute la PR
cherche.

- [ ] **Étape 4 : lancer la suite complète**

Lancer : `bun run test`
Attendu : typecheck, tests, Biome, format et clés i18n, tout vert.

- [ ] **Étape 5 : passe appareil**

Écrire `~/.claude-tmp/streamyfin/CHECKLIST-seerr-bascule.md` avec un point par écran Seerr
et par plateforme : découverte, recherche, fiche film, fiche série avec ses saisons, demande,
signalement d'un problème, connexion automatique, et la liste des demandes. La bascule ne
change aucun comportement, donc la vérification consiste à retrouver exactement ce qu'on
avait.

- [ ] **Étape 6 : commit puis `/code-review` au niveau maximum, et ouvrir la PR 4**

```bash
git commit -m "refactor(seerr): read the API types from utils/seerr and drop the submodule"
```

---

## PR 5 : le renommage

### Tâche 11 : les clés persistées

**Fichiers :**
- Modifier : `hooks/useJellyseerr.ts`, `utils/migrations.ts`
- Test : `utils/migrations.test.ts`

- [ ] **Étape 1 : écrire le test qui échoue**

```ts
test("reads the Seerr session written under the old key and rewrites it", () => {
  storage.set("JELLYSEERR_USER", JSON.stringify({ id: 7 }));
  migrateSeerrKeys();
  expect(storage.getString("SEERR_USER")).toBe(JSON.stringify({ id: 7 }));
  expect(storage.getString("JELLYSEERR_USER")).toBeUndefined();
});

test("leaves a session already written under the new key alone", () => {
  storage.set("SEERR_USER", JSON.stringify({ id: 9 }));
  storage.set("JELLYSEERR_USER", JSON.stringify({ id: 7 }));
  migrateSeerrKeys();
  expect(storage.getString("SEERR_USER")).toBe(JSON.stringify({ id: 9 }));
});
```

Le second cas existe parce qu'un utilisateur qui installe, revient en arrière, puis
réinstalle, a les deux clés. Écraser la neuve par l'ancienne le déconnecterait.

- [ ] **Étape 2 : lancer et vérifier l'échec**

Lancer : `bun test utils/migrations.test.ts`
Attendu : échec, `migrateSeerrKeys is not a function`.

- [ ] **Étape 3 : écrire la migration**

```ts
const RENAMED = [
  ["JELLYSEERR_USER", "SEERR_USER"],
  ["JELLYSEERR_COOKIES", "SEERR_COOKIES"],
] as const;

/**
 * Carries a Seerr session written under the old key names.
 *
 * A device that installed, went back to an older build, then updated again
 * holds both keys. The new one is the one that was written last by a build
 * that knows about both, so it wins, and the old one goes either way.
 */
export const migrateSeerrKeys = (): void => {
  for (const [old, renamed] of RENAMED) {
    const carried = storage.getString(old);
    if (carried !== undefined && storage.getString(renamed) === undefined) {
      storage.set(renamed, carried);
    }
    storage.remove(old);
  }
};
```

- [ ] **Étape 4 : lancer et vérifier le succès**

Lancer : `bun test utils/migrations.test.ts`
Attendu : 2 pass.

- [ ] **Étape 5 : commit**

```bash
git commit -m "fix(seerr): carry the stored session over to the new key names"
```

### Tâche 12 : le renommage mécanique

**Fichiers :** 100 fichiers, 1526 occurrences.

- [ ] **Étape 1 : renommer les fichiers et les dossiers**

`git mv` pour chacun, pour que l'historique suive.

- [ ] **Étape 2 : renommer les identifiants**

Trois passes distinctes, `jellyseerr`, `Jellyseerr`, `JELLYSEERR`, en vérifiant le
typecheck entre chaque. Ne pas toucher aux clés déjà migrées à la tâche 11.

- [ ] **Étape 3 : garder les anciennes routes de deep link**

Les segments `/jellyseerr/...` restent servis et redirigent vers `/seerr/...`, parce qu'ils
peuvent être dans des liens déjà partagés. Un test par route conservée.

- [ ] **Étape 4 : les clés i18n**

Renommer dans `translations/en.json` uniquement, puis laisser Crowdin propager. Vérifier
avec `bun run i18n:check`.

- [ ] **Étape 5 : lancer la suite complète et la passe appareil**

- [ ] **Étape 6 : commit puis `/code-review` au niveau maximum, et ouvrir la PR 5**

---

## Ce qui reste hors de ce plan

Le renommage côté plugin, 27 fichiers et 166 occurrences, part en PR normale sur le
`develop` du plugin. Les clés `jellyseerrServerUrl` et `jellyseerrApiKey` restent servies
tant que des versions publiées de l'app les lisent, le bloc `seerr` étant déjà servi en
parallèle depuis la #198.

La contribution amont, la réactivation de la validation des réponses chez Seerr, est un
chantier séparé qui ne bloque rien ici.
