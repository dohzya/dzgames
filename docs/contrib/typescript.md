---
date: 2026-03-27
git_ref: d0b2eef
---

# Style TypeScript

## Immutabilité

Préférer l'immutabilité par défaut. Utiliser `readonly` sur les propriétés et paramètres,
`ReadonlyArray<T>` pour les tableaux, `Readonly<T>` pour les objets qui ne doivent pas être mutés.
Éviter les mutations directes — retourner de nouvelles valeurs à la place.

```ts
// ✗
function push(stack: number[], value: number): void {
  stack.push(value);
}

// ✓
function push(stack: ReadonlyArray<number>, value: number): ReadonlyArray<number> {
  return [...stack, value];
}
```

## Typage fort

- **Pas de `any`** — refusé par le linter. Utiliser `unknown` si le type est vraiment inconnu.
- **Pas de type assertions (`as`)** sauf cas exceptionnel documenté. Préférer les type guards.
- **Pas d'assertions non-nulles (`!`)** — gérer explicitement les cas `null | undefined`.
- Préférer les `type` aux `interface` pour les types de données simples.
- Utiliser des types nominaux (`type UserId = string & { readonly _brand: "UserId" }`) pour
  distinguer des primitives sémantiquement différentes si nécessaire.

```ts
// ✗
const cell = cellMap.get(key) as Cell;

// ✓
const cell = cellMap.get(key);
if (cell === undefined) return;
```

## CQS — Command/Query Separation

- **Queries** : fonctions pures, pas d'effets de bord, retournent une valeur.
  Nommage : `getX`, `computeX`, `isX`, `hasX`.
- **Commands** : causent des effets de bord, ne retournent pas de valeur utile (retournent `void`).
  Nommage : `setX`, `updateX`, `applyX`, `doX`.

Ne pas mélanger : une fonction qui mutait l'état ET retournait un résultat viole CQS.

```ts
// ✗ — mute et retourne
function popTop(stack: number[]): number {
  return stack.pop()!;
}

// ✓ — query pure
function topOf(stack: ReadonlyArray<number>): number | null {
  return stack.length > 0 ? (stack[stack.length - 1] ?? null) : null;
}

// ✓ — command void
function applyMove(board: Board, move: Move): void {
  // mute board en place (acceptable dans un contexte impératif délimité)
}
```

## Organisation

- Un fichier = une responsabilité claire.
- Pas d'export default sauf pour les composants React (convention Vite/React).
- Types partagés dans `types.ts` au niveau du module.
- Constantes dans `constants.ts`.
- Pas de `barrel` exports chaînés profonds — garder les imports directs et lisibles.

## Nommage

| Élément           | Convention       | Exemple                  |
| ----------------- | ---------------- | ------------------------ |
| Type / Interface  | PascalCase       | `CellState`, `Board`     |
| Fonction          | camelCase        | `computeSteps`           |
| Constante         | UPPER_SNAKE_CASE | `CLEAR_AT`, `VIEWPORT_W` |
| Composant React   | PascalCase       | `HexStackGame`           |
| Fichier logique   | kebab-case       | `scoring.ts`             |
| Fichier composant | PascalCase       | `FloorHex.tsx`           |
