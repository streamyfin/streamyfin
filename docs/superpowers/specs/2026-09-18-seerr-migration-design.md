# Migration jellyseerr vers seerr

Conception validée le 18 septembre 2026. Remplace la conception du 17 juin 2026, qui
prévoyait un SDK généré publié sur npm et qui est abandonnée.

## Le problème

L'app dépend de `utils/jellyseerr`, un sous-module git qui pointe sur
`herrrta/jellyseerr@models`, un fork du serveur Seerr. Elle y prend 44 symboles répartis
sur 26 modules : des types de réponse, des enums, une fonction de permissions et trois
tables de données de l'interface web.

Ce que ça coûte aujourd'hui :

- le fork a divergé : 69 commits devant, **518 derrière** le `develop` de l'amont au
  18 septembre 2026, donc les types décrivent un serveur que plus personne ne fait
  tourner ;
- un clone sans `git submodule update --init` ne compile pas, ce qui a déjà coûté un
  diagnostic entier sur un worktree neuf ;
- on dépend d'une personne qui maintient un fork d'un serveur pour typer un client mobile ;
- et le nom `jellyseerr` est mort en amont, le projet s'appelle Seerr.

## Ce qui a été mesuré

Tout ce qui suit a été mesuré le 18 septembre 2026, contre `seerr-api.yml` v3.4.1 et contre
un vrai serveur Seerr en `develop`, session authentifiée.

### La spec est complète en surface

216 opérations, 181 avec un corps JSON typé, 35 sans corps, zéro schéma libre. Les 31
appels que l'app fait à Seerr sont tous déclarés. `openapi-typescript` produit 10 468
lignes dans un seul fichier, en 69 ms, sans dépendance à l'exécution.

### Mais elle n'est pas contractuelle au retour

`server/index.ts` monte `express-openapi-validator` avec `validateRequests: true` et rien
sur les réponses. La moitié retour n'est donc vérifiée par personne.

Empreintes de forme relevées sur 29 routes qui répondent 200 : **106 écarts sur 12
routes**. 87 champs servis mais non déclarés, 13 champs déclarés requis et absents, 6
champs déclarés non nullables et servis à `null`.

| Route | Écarts | Nature |
|---|---|---|
| `/settings/public` | 26 | sert `fullPublicSettings` (28 champs), la spec déclare `PublicSettings` (2) |
| `/media` | 19 | `MediaInfo` déclare 6 champs sur 25 |
| `/auth/me` | 15 | sert l'utilisateur non filtré, la spec décrit une troisième forme |
| `/user` | 14 | sert l'utilisateur filtré, `email` déclaré requis et retiré par `User.filteredFields` |
| `/request` | 11 | `MediaRequest` sans `type`, `tags`, `seasons`, `isAutoRequest` |
| `/service/radarr` et `/service/sonarr` | 7 chacun | déclarent `RadarrSettings` et `SonarrSettings`, servent `ServiceCommonServer` |
| `/settings/discover` | 3 | `DiscoverSlider` sans `order`, `createdAt`, `updatedAt` |
| `/discover/movies`, `/discover/tv`, `/issue`, `/regions` | 1 chacun | champ manquant |

Deux erreurs franches en plus, trouvées hors de ce comptage : `/tv/{id}` déclare
`numberOfSeason` alors que le serveur renvoie `numberOfSeasons`, et
`/tv/{id}/season/{n}` déclare le résumé `Season` alors qu'il sert la saison avec ses
épisodes.

### Les enums ne sont pas typés

`MediaStatus`, `MediaRequestStatus`, `IssueType`, `IssueStatus`, `Permission` et
`DiscoverSliderType` sortent en `number`, leurs valeurs vivant seulement dans une
description en prose. `mediaType` sort en `string` et non en union `"movie" | "tv"`.

Conséquence directe : **générer les types depuis la spec seule ferait perdre en qualité par
rapport au sous-module actuel**. C'est ce qui a disqualifié l'option de la seule génération.

### En face, les unions sont exactes

`/discover/*` et `/search` déclarent leurs résultats en `anyOf` de `MovieResult`,
`TvResult` et `PersonResult`. Chaque élément réel colle exactement à une variante, zéro
champ inconnu. Seul `mediaInfo` manque quand le média n'existe pas côté Seerr, ce qui est
correct.

## La cause, dans leur architecture

Trois choses se cumulent en amont.

**Pas de couche de sortie.** `server/entity/User.ts` est à la fois la ligne typeorm et ce
que `/auth/me` sert. La forme servie n'a donc pas de nom. Pire, le même schéma `User` sert
deux sérialisations différentes : `/auth/me` renvoie l'utilisateur complet, `/user` renvoie
l'utilisateur passé par `User.filteredFields`, qui retire `email`, `plexId`, `password`,
`resetPasswordGuid`, `jellyfinDeviceId`, `jellyfinAuthToken`, `plexToken` et `settings`. La
spec décrit une troisième forme qui n'est ni l'une ni l'autre, et déclare notamment
`plexToken` et `jellyfinAuthToken`, que l'API ne sert jamais.

**La spec est écrite à la main** à côté du code, et rien ne la confronte au comportement.

**Leur seul client vit dans le même dépôt.** L'interface Next.js importe `server/**`
directement, donc l'absence de contrat ne leur coûte rien. Le sous-module de l'app, c'est
donner au client mobile le même privilège que l'interface web : ça marche pour cette
raison, et ça ne peut pas être propre pour la même raison.

## Options écartées

**Vendoriser les sources amont.** Impossible : la fermeture des sources traverse 54
fichiers et 37 paquets à l'exécution, typeorm, axios, zod, undici, web-push.

**Un SDK maison publié sur npm.** Abandonné : ce n'est pas à nous de maintenir un projet
pareil, et un SDK généré depuis la spec hérite de tous les écarts ci-dessus. Il en existe
d'ailleurs déjà un, `@billos/seerr-sdk`, et c'est précisément son auteur qui a ouvert
l'issue amont #3298 parce que les types générés faisaient échouer ses requêtes.

**Générer nos types depuis le code amont.** Techniquement faisable, et c'était la surprise
de l'étude : la fermeture des **types** des 44 symboles ne touche que 39 fichiers et ne
référence que deux paquets externes, `EntityManager` de typeorm et trois types zod, tous
dans des méthodes qu'une extraction de forme jette. Écarté quand même pour deux raisons.
D'abord ça nous rend propriétaires d'un générateur branché sur les internes de quelqu'un
d'autre, c'est à dire le piège du sous-module, juste automatisé. Ensuite ça encoderait des
champs que l'API retire avant de répondre, comme `plexToken`, donc des types faux au
niveau de la frontière qui compte.

**La seule génération depuis la spec.** Insuffisante, mesuré ci-dessus.

## La solution retenue

Trois couches dans `utils/seerr/`, plus la machinerie qui les tient à jour.

### 1. `generated/api.d.ts`

Sorti de `seerr-api.yml` épinglé, par `openapi-typescript`. Types seuls, effacés à la
compilation, jamais édités à la main. L'épingle vit dans `generated/pin.json` : le dépôt,
le tag, et l'empreinte sha256 du fichier source. Le fichier généré porte la même empreinte
en tête, donc une modification manuelle se voit.

### 2. `types.ts`

La couche qu'on tient nous même, et qui doit rester petite. Elle contient exactement ce que
la spec ne peut pas donner :

- les enums numériques, le bitmask `Permission` et `hasPermission` ;
- les unions discriminées sur `mediaType` ;
- les corrections des routes mesurées fausses, chacune avec un commentaire disant ce qui a
  été mesuré et quand, pour qu'on sache quoi retirer le jour où l'amont corrige.

Estimation à partir de ce que l'app importe : 250 à 350 lignes. C'est ce que le sous-module
apportait réellement.

### 3. `data.ts`

`networks`, `studios`, `genreColorMap`, `COMPANY_LOGO_IMAGE_FILTER`, `ANIME_KEYWORD_ID`.
Des constantes, pas du code. Copiées une fois, avec leur provenance et la licence MIT de
Seerr.

Le client HTTP, la classe `JellyseerrApi` de `hooks/useJellyseerr.ts`, ne change pas de
place dans ce chantier. Il change de types.

## La machinerie

**`scripts/seerr/generate-types.ts`** télécharge la spec à la référence épinglée, la passe
dans `openapi-typescript`, écrit le fichier généré et l'empreinte.

**`.github/workflows/seerr-spec.yml`**, hebdomadaire et à la demande. Il compare la
dernière release de Seerr à l'épingle. Si le fichier généré change, il ouvre une PR dont le
corps liste les routes ajoutées et les schémas modifiés. Rien ne se merge tout seul.

**`bun run seerr:capture`** rejoue les routes que l'app utilise contre un Seerr et écrit
dans `utils/seerr/__fixtures__/` des empreintes **de forme uniquement** : les clés et le
type de chaque valeur, jamais les valeurs. Aucune URL, aucun jeton, aucun titre.

**`utils/seerr/contract.test.ts`** tourne sur chaque PR, sans réseau et sans secret. Pour
chaque empreinte il vérifie que le type utilisé par l'app accepte la réponse réelle et
qu'aucune clé servie n'est absente du type. Un champ ajouté ou renommé en amont rend le
test rouge en nommant la route et le champ.

### Deux régimes

Sur chaque PR, le test sur empreintes seul : quelques millisecondes, rien à installer.

Quand l'épingle bouge, et seulement là, le workflow monte un Jellyfin et un Seerr en
conteneurs, les câble par l'API, lance la capture et committe les empreintes rafraîchies
dans la même PR que la spec. Deux faits rendent ça possible sans secret : Seerr embarque sa
propre clé TMDB en dur dans `server/api/themoviedb/index.ts`, et le premier compte
administrateur se crée par `POST /auth/jellyfin` en passant `hostname`.

Le choix de ne pas faire tourner un vrai serveur sur chaque PR est délibéré. Ce que le test
de contrat attrape ne change qu'avec une version de Seerr, c'est à dire toutes les quatre à
huit semaines. Payer un serveur à chaque PR reviendrait à importer une dépendance réseau à
TMDB dans une CI qui n'en a pas besoin.

### Limite assumée

Le test ne voit que ce que les empreintes ont capturé. C'est pour ça que la capture est une
seule commande et qu'elle est rejouée automatiquement quand l'épingle bouge.

## Livraison

Branche `seerr-migration` sortie de `develop` dans l'app. Elle reste ouverte le temps du
chantier, chaque partie arrive dessus par sa propre PR, et une seule PR part vers `develop`
à la fin. Même schéma que la refonte du plugin.

1. **Le générateur et son workflow.** Ajoute `scripts/seerr/`, `utils/seerr/generated/` et
   `.github/workflows/seerr-spec.yml`. Ne touche à rien d'existant.
2. **La couche tenue à la main.** `types.ts` et `data.ts` avec leurs tests. Personne ne les
   consomme encore.
3. **La capture et le test de contrat.** Prouve les couches 1 et 2 contre des formes
   réellement mesurées.
4. **La bascule.** Le client et les hooks passent sur les nouveaux types, le sous-module
   `utils/jellyseerr` et le dossier `utils/_jellyseerr` disparaissent. Le typecheck est le
   juge, plus une passe appareil sur les écrans Seerr.
5. **Le renommage complet.**

Ne jamais passer `--delete-branch` en mergeant une PR sur laquelle une autre est empilée,
ça ferme la PR enfant.

## Le renommage et les migrations

Surface mesurée dans l'app : 100 fichiers, 1526 occurrences, 7 clés i18n, 14 usages des
clés MMKV, 4 routes de deep link.

Trois choses ne peuvent pas être renommées d'un coup sec :

- **les clés MMKV** `JELLYSEERR_USER` et `JELLYSEERR_COOKIES` se lisent sous l'ancien nom,
  se réécrivent sous le nouveau, et l'ancienne est supprimée après la réécriture ;
- **les routes de deep link** `/jellyseerr/...` restent servies en redirection vers les
  nouvelles, parce qu'elles peuvent être dans des liens déjà partagés ;
- **les clés i18n** partent par Crowdin, `en.json` étant la source.

Côté plugin, 27 fichiers et 166 occurrences, et seulement deux clés exposées,
`jellyseerrServerUrl` et `jellyseerrApiKey`. Le plugin sert déjà le bloc `seerr` **et** les
clés plates depuis la #198, précisément pour ça. Les clés plates restent servies tant que
des versions publiées de l'app les lisent. Le renommage interne part en PR normale sur le
`develop` du plugin.

## La stratégie amont

Le sujet est connu chez eux. L'issue #3298 est ouverte depuis le 27 juillet 2026, un
mainteneur y a confirmé que des parties sont périmées.

Deux PRs ont déjà tenté la correction en masse et sont mortes de la même façon : la #2700,
qui corrigeait exactement les mêmes schémas que ceux mesurés ici, a pris trois remarques de
review sans réponse de son auteur, puis des conflits, puis le label stale, puis la
fermeture. La #2158, 49 commits sur le yaml, est en conflit depuis février 2026. Pendant ce
temps une PR courte et mono sujet, la #3425 sur le schéma de requête de `/watchlist`, est
vivante.

Donc pas de troisième grosse PR de schémas. Ce qu'on apporte, et que personne n'a tenté,
c'est le correctif structurel : activer la validation des réponses dans leur environnement
de test, pour que leur propre suite Cypress refuse une réponse qui ne colle pas à la spec.
Une seule PR, un seul sujet, et les corrections de champs deviennent mécaniques pour tout
le monde ensuite.

Leur guide impose par ailleurs : divulgation de toute assistance IA, texte des issues et
des PRs écrit par le contributeur et pas par un outil, titre en Conventional Commits,
branche partant de `develop`, rebase obligatoire, Prettier, `pnpm build` et `pnpm test`
passés avant soumission.

**Notre migration ne dépend d'eux pour rien.** Notre couche couvre les écarts aujourd'hui
et rétrécit si et quand ils corrigent.

## Risques

**Le fichier généré est gros.** 10 468 lignes, 316 Ko. C'est du type pur, donc rien n'en
arrive dans le bundle, mais ça pèse sur les diffs et sur le serveur de langage. Atténué par
le fait qu'il n'est jamais relu à la main : la PR de rafraîchissement porte le résumé des
changements, pas le diff brut.

**Le renommage est massif.** 1526 occurrences. Atténué en le sortant du lot de la bascule,
et en le gardant mécanique.

**Les empreintes proviennent d'un seul serveur.** Une installation Plex, ou sans Radarr,
servira des formes différentes. Atténué par le fait que les écarts intéressants sont des
champs absents, pas des champs en trop, et que la capture est rejouable par n'importe quel
mainteneur sur sa propre installation.
