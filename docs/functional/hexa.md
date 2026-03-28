---
date: 2026-03-28
git_ref: 2d2f56d
---

# Hex Stack — Règles fonctionnelles

## Vocabulaire

| Terme              | Définition                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **tuile**          | Un hexagone individuel, caractérisé par sa couleur. Unité de base du jeu.                                                                           |
| **pile**           | Colonne de tuiles empilées sur une case du plateau. Peut être posée (sur le plateau) ou entrante (dans la zone d'attente).                          |
| **bloc**           | Séquence consécutive de tuiles de même couleur en tête d'une pile. C'est le bloc de tête qui participe aux transferts et aux clears.                |
| **case vide**      | Case débloquée ne contenant aucune tuile. Seule destination valide pour poser une pile entrante.                                                    |
| **case auto-pile** | Case verrouillée à déverrouillage automatique (seuil de score) qui contient une pile préchargée. Affichée en transparence avec le ghost de la pile. |
| **case auto-vide** | Case verrouillée à déverrouillage automatique, sans pile préchargée.                                                                                |
| **case payante**   | Case verrouillée nécessitant un achat explicite (clic + déduction de points).                                                                       |

---

## Concept

Jeu de puzzle hexagonal sur plateau infini. Le joueur pose des **piles** de **tuiles** colorées sur le
plateau, cherchant à regrouper **10 tuiles identiques en tête** (un bloc de 10+) pour les effacer et
gagner des points. Les points servent à étendre le plateau.

---

## Plateau de départ

- Grille hexagonale virtuelle de 31×31 cases.
- Au démarrage : un cluster connecté de **10 cases débloquées** aléatoirement autour du centre,
  générée par BFS stochastique. La forme change à chaque partie.
- L'hexagone central est au milieu de la grille (col 15, row 15).
- Les deux anneaux voisins du cluster initial sont révélés comme **cases verrouillées** (vagues 1 et 2).

---

## Cases verrouillées

Chaque case verrouillée a un type déterminé aléatoirement à sa création :

| Type                        | Proba | Paramètre   | Visuel                     |
| --------------------------- | ----- | ----------- | -------------------------- |
| Case auto-pile (3 couleurs) | 10 %  | seuil × 1.5 | ghost pile + seuil affiché |
| Case auto-pile (4 couleurs) | 57 %  | seuil × 1.0 | ghost pile + seuil affiché |
| Case auto-pile (5 couleurs) | 10 %  | seuil × 0.5 | ghost pile + seuil affiché |
| Case auto-vide              | 3 %   | seuil × 2.0 | seuil centré               |
| Case payante                | 20 %  | coût × 1.0  | 🔒 + coût en points        |

**Auto** : se débloque automatiquement quand `score ≥ seuil` ET que la case est "prête".
**Payante** : clic/tap du joueur, déduit le coût du solde (impossible si solde insuffisant).

### Coût/seuil par vague

```
baseCostForWave(w) = round(100 × 1.45^(w-1)) × orderMult
```

`orderMult = 1 + ln(revealOrder) × 0.8` — croît avec le nombre total de cases déjà révélées.

Exemples : vague 1 → ~100 pts, vague 2 → ~145 pts, vague 3 → ~210 pts, vague 4 → ~305 pts.

### Case "prête"

La readiness est **monotonique** : une case devient prête et ne peut jamais redevenir non-prête
(sauf par undo, qui restaure l'état complet).

Une case verrouillée devient prête dès qu'elle est adjacente à :

- une **case vide** débloquée, OU
- une case qui a reçu un transfert lors du dernier mouvement, OU
- une case qui vient de recevoir une pile entrante.

En pratique, les deux derniers cas sont couverts par la monotonie : si la case était prête
avant la pose (voisin vide), elle le reste après (même si ce voisin est maintenant occupé).

L'état `everReady` est stocké dans la `CellState` et inclus dans les snapshots d'undo.

Les cases non-prêtes sont affichées à 45 % d'opacité, sans ghost pile.

Quand une case auto se débloque, ses voisines inédites sont révélées en vague+1.

### BFS cascade au déverrouillage

Qu'il s'agisse d'une **case payante** ou d'une **case auto-pile**, la pile préchargée est
immédiatement soumise à la cascade BFS dès que la case se débloque. Les transferts et clears
éventuels sont calculés et scorés normalement.

---

## Piles entrantes

- 3 **piles entrantes** affichées en bas de l'écran, toujours visibles.
- Le joueur glisse ou clique une pile entrante vers une **case vide** débloquée.
- Après chaque pose, une nouvelle pile est générée selon la progression courante.

### Génération d'une pile entrante

- Taille totale : 2 à 5 tuiles.
- Nombre de couleurs : 1 à `maxColors` (selon progression).
- Les couleurs sont tirées par pondération parmi les `nc` premières de la palette.

#### Poids des couleurs

Les 4 couleurs de base ont un poids égal (1.0). Chaque couleur rare vaut ×0.7 par rapport à la précédente :

| Couleur    | Indice | Poids |
| ---------- | ------ | ----- |
| Magenta    | 0      | 1.00  |
| Menthe     | 1      | 1.00  |
| Bleu       | 2      | 1.00  |
| Jaune      | 3      | 1.00  |
| Violet     | 4      | 0.70  |
| Turquoise  | 5      | 0.49  |
| Blanc      | 6      | 0.34  |
| Noir       | 7      | 0.24  |

---

## Règles d'un coup

### Ce qu'on peut poser

On ne peut poser une pile entrante que sur une **case vide débloquée**. Une case occupée
(même par une seule tuile) ne peut pas recevoir de pile.

### Cascade BFS — exemple

Plateau avec :

- Case A (cible) : vide
- Case B (voisine de A) : `[bleu, jaune, jaune]`
- Case C (voisine de B) : `[bleu]`

On pose `[jaune]` sur A :

1. A devient `[jaune]`
2. B a `jaune` en tête → ses 2 tuiles jaune du dessus transfèrent vers A → A = `[jaune, jaune, jaune]`, B = `[bleu]`
3. B vient d'être modifiée → réenfilée. A a `jaune` en tête, B a `bleu` : pas de transfert.
4. A a 3 tuiles `jaune` en tête. Pas encore 10 → pas de clear.

---

## Clear

Quand un **bloc de tête** atteint **≥ 10 tuiles** de même couleur, ce bloc est effacé.
Le clear peut en déclencher d'autres dans la même cascade.
Chaque clear crédite ses points **au moment où il se produit** pendant l'animation.

---

## Scoring

### Points par clear

```
clearPts(n) = 10 + (n - 10)²
```

`n` = nombre de tuiles effacées (minimum 10).

Exemples :
| Effacées | Points |
|---|---|
| 10 | 10 |
| 11 | 11 |
| 12 | 14 |
| 13 | 19 |
| 15 | 35 |

### Multiplicateur combo

Un coup consécutif avec clear incrémente le combo. Un coup sans clear remet le combo à 0,
même s'il contient des transferts.

```
comboMult(n) = n
```

| Combo | Multiplicateur |
| ----- | -------------- |
| 1     | × 1            |
| 2     | × 2            |
| 3     | × 3            |
| …     | …              |

### Bonus transferts

S'applique si le coup contient **≥ 3 transferts** et qu'**aucune pile n'est vidée** :

```
transferBonus(n) = fib(n - 1)  pour n ≥ 3, 0 sinon
```

(fibonacci décalé : 3→1, 4→2, 5→3, 6→5, 7→8, 8→13…)

### Multiplicateur pile vidée

Si au moins une pile est entièrement vidée par les transferts du coup,
le multiplicateur **remplace** le bonus transferts (pas de cumul) :

```
emptyMult(n) = n + 1
```

| Piles vidées | Multiplicateur |
| ------------ | -------------- |
| 0            | × 1            |
| 1            | × 2            |
| 2            | × 3            |
| …            | …              |

Le multiplicateur est affiché comme popup séparé après l'animation.

---

## Actions spéciales

Coût = `baseCost + 50 × utilisations précédentes`

### ↩ Annuler (5 pts)

Restaure l'état complet avant le dernier coup : board, 3 piles entrantes, cellMap, score, combo.
Le coût est déduit du **solde restauré** (pas du solde actuel).
Désactivé si solde < 5. Historique limité à 5 coups.

### ⇄ Swap (100 pts, +50/utilisation)

1. Cliquer une première case (surlignée en or)
2. Cliquer une deuxième case
   → Les contenus s'échangent, puis la cascade BFS se déclenche sur les deux cases.
   Re-cliquer la même case annule la sélection.

### ↓ Bubble (80 pts, +50/utilisation)

Intervertit les deux blocs de couleur du haut d'une pile.
`JJVRRBB → VJJRRBB`
Nécessite ≥ 2 blocs distincts. Puis cascade BFS.

### ✂ Trim (150 pts, +50/utilisation)

Supprime entièrement le bloc de la couleur de tête.
`JJVRRBB → VRRBB`
Puis cascade BFS — les voisins peuvent transvaser vers le nouveau sommet.

---

## Progression (basée sur `moveCount`)

| Moves   | Couleurs dispo | Max couleurs/pile | Nouvelles couleurs           |
| ------- | -------------- | ----------------- | ---------------------------- |
| 0 – 9   | 4              | 2                 | magenta, menthe, bleu, jaune |
| 10 – 19 | 5              | 2                 | + violet                     |
| 20 – 34 | 5              | 3                 | —                            |
| 35 – 49 | 6              | 3                 | + turquoise                  |
| 50 – 69 | 7              | 3                 | + blanc                      |
| 70+     | 8              | 3                 | + noir                       |

Un bandeau s'affiche brièvement lors de l'ajout d'une nouvelle couleur.

---

## Fin de partie

Déclenchée quand **aucune case débloquée n'est vide** et que le joueur n'a plus les points
nécessaires pour acheter une case payante.

Ne pas confondre avec "plus de points" — on peut être bloqué avec un solde positif si toutes
les cases sont occupées et qu'aucune case payante n'est accessible faute de solde suffisant.

Conseil : garder au moins une case vide en réserve, ou débloquer une case payante avant d'être coincé.

---

## Contrôles

| Geste                                 | Action                                   |
| ------------------------------------- | ---------------------------------------- |
| Glisser une pile entrante → case vide | Poser la pile                            |
| Relâcher hors du plateau              | Annule le glisser                        |
| Cliquer/taper une case 🔒 prête       | Débloquer (tremble si solde insuffisant) |
| Glisser sur le plateau (sans pile)    | Déplacer la vue                          |
| Cliquer un bouton d'action            | Active le mode outil                     |
| Cliquer une case en mode outil        | Applique l'outil                         |
| Cliquer "annuler" sous le hint        | Désactive le mode outil sans coût        |
| Glisser une pile en mode outil        | Désactive l'outil et lance le glisser    |

### Code de triche

1 clic pile 1 → 2 clics pile 2 → 3 clics pile 3 (ordre exact)
→ bouton 🐛 +100 pts, cliquable à volonté.

---

## Navigation

Depuis un jeu, le joueur peut revenir à la page de sélection des jeux via un bouton visible.
