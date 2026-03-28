# HEX STACK — Spec fonctionnelle (complément à la doc embarquée)

Ce document couvre uniquement ce que la doc embarquée dans `hex-stack.jsx` ne détaille pas :
règles de jeu lisibles pour un humain, exemples, cas limites, et contrôles.

---

## Plateau de départ

Le plateau initial est une forme organique aléatoire d'exactement 10 cases connectées,
générée par un BFS stochastique depuis le centre. La forme change à chaque partie.
Les deux anneaux voisins sont révélés dès le départ comme cases verrouillées (vagues 1 et 2).

---

## Règles d'un coup

### Ce qu'on peut poser
On ne peut poser une pile que sur une case **débloquée et vide**. Une case occupée (même par
une seule tuile) ne peut pas recevoir de pile.

### Cascade BFS — exemple
Plateau avec :
- Case A (cible) : vide
- Case B (voisine de A) : `[bleu, jaune, jaune]`
- Case C (voisine de B) : `[bleu]`

On pose `[jaune]` sur A :
1. A devient `[jaune]`
2. B a `jaune` en tête → ses 2 jaunes du dessus transvèrent vers A → A = `[jaune, jaune, jaune]`, B = `[bleu]`
3. B vient d'être modifiée → réenfilée. A a `jaune` en tête, B a `bleu` : pas de transfert.
4. A a 3 `jaune` en tête. Pas encore 10 → pas de clear.

### Clear
Quand une pile atteint ≥ 10 hexagones de **même couleur en tête**, ce bloc est effacé.
Le clear peut en déclencher d'autres dans la même cascade.
Chaque clear crédite ses points **au moment où il se produit** pendant l'animation.

---

## Scoring — exemples

### Clear de base
| Effacés | Points |
|---|---|
| 10 | 10 |
| 11 | 11 |
| 12 | 14 |
| 13 | 19 |
| 15 | 35 |

### Combo
- 1er coup avec clear : ×1
- 2e coup consécutif avec clear : ×1.5 sur les clears du coup
- 3e et suivants : ×2
- Un coup sans clear remet le combo à 0, même si ce coup contient des transferts.

### Bonus transferts
S'applique si le coup contient ≥ 3 transferts **et qu'aucune pile n'est vidée** :
3 → +1, 4 → +2, 5 → +3, 6 → +5, 7 → +8, 8 → +13… (Fibonacci décalé)

### Multiplicateur pile vidée
Si au moins une pile est entièrement vidée par les transferts du coup,
le multiplicateur **remplace** le bonus transferts (pas de cumul) :
- 1 pile vidée → total des clears × 1.5
- 2+ piles vidées → × 2

Le multiplicateur est affiché comme popup séparé après l'animation.

---

## Actions spéciales — détails

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
Puis cascade BFS — les voisins peuvent transvaservers le nouveau sommet.

---

## Fin de partie

Déclenchée quand **aucune case débloquée n'est vide**.
Ne pas confondre avec "plus de points" — on peut être bloqué avec un solde positif si toutes
les cases sont occupées et qu'aucune payante n'est accessible faute de solde suffisant.

Conseil : garder au moins une case vide en réserve, ou débloquer une case payante avant d'être coincé.

---

## Contrôles

| Geste | Action |
|---|---|
| Glisser une pile → case vide | Poser la pile |
| Relâcher hors du plateau | Annule le glisser |
| Cliquer/taper une case 🔒 prête | Débloquer (tremble si solde insuffisant) |
| Glisser sur le plateau (sans pile) | Déplacer la vue |
| Cliquer un bouton d'action | Active le mode outil |
| Cliquer une case en mode outil | Applique l'outil |
| Cliquer "annuler" sous le hint | Désactive le mode outil sans coût |
| Glisser une pile en mode outil | Désactive l'outil et lance le glisser |

### Code de triche
1 clic pile 1 → 2 clics pile 2 → 3 clics pile 3 (ordre exact)
→ bouton 🐛 +100 pts, cliquable à volonté.
