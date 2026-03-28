---
date: 2026-03-27
git_ref: d0b2eef
---

# Architecture globale

## Stack technique

- **Bundler** : Vite 6
- **Framework** : React 18 avec JSX transform automatique
- **Langage** : TypeScript strict (`strict: true`, `noUncheckedIndexedAccess`, etc.)
- **Linter** : ESLint 9 (flat config), règles strict-TypeChecked
- **Formatter** : Prettier

## Structure des dossiers

```
src/
  games/
    <game-name>/
      types.ts          # Types du domaine (aucune dépendance React)
      constants.ts      # Constantes numériques/visuelles
      <module>.ts       # Logique pure (geometry, scoring, steps, board…)
      components/
        <Component>.tsx # Composants React du jeu
      index.ts          # Re-exports publics du module
  pages/
    GameList.tsx        # Page de sélection des jeux
  App.tsx               # Routing par état (pas de dépendance router externe)
  main.tsx              # Point d'entrée
  index.css             # Reset CSS global minimal
```

## Principe de séparation

La logique de jeu (calculs, règles, état) doit être **entièrement séparée** des composants React :

- Les fichiers `.ts` (hors `components/`) ne contiennent **aucun import React**.
- Les composants `.tsx` ne contiennent **aucune logique métier** : ils délèguent aux modules `.ts`.
- Cette séparation permet de tester la logique sans rendu.

## Routing

Pas de bibliothèque de routing externe. Le routing est géré par un état React simple dans `App.tsx` :

```tsx
type Route = { page: "list" } | { page: "game"; gameId: string };
```

Chaque jeu expose un composant racine dans son `index.ts`. La page de liste connaît
le catalogue des jeux disponibles.

## Jeux

Chaque jeu est un module autonome dans `src/games/<game-name>/`. Il expose :

- Son composant principal (ex. `HexStackGame`)
- Les métadonnées (id, titre, description) via son `index.ts`

L'ajout d'un nouveau jeu consiste à créer le dossier et à l'enregistrer dans le catalogue
de `GameList.tsx`.

## Tests

Les tests unitaires testent la logique pure (modules `.ts`). Les tests d'intégration/composants
testent les composants clés. Suivre TDD : test d'abord, implémentation ensuite.

Fichiers de test colocalisés : `<module>.test.ts` à côté de `<module>.ts`.

## Docs

Les fichiers de documentation portent un header YAML avec `date` (ISO) et `git_ref`
(hash court du commit de dernière mise à jour). À mettre à jour à chaque modification
substantielle du fichier.

- `docs/contrib/` — conventions et règles générales (style, archi)
- `docs/functional/` — règles fonctionnelles et comportements attendus des jeux
- `docs/technical/` — explications techniques sur les algorithmes ou systèmes complexes
