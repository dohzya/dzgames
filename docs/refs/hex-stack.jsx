/*!
# HEX STACK — Documentation

## Concept
Jeu de puzzle hexagonal sur plateau infini. Le joueur empile des hexagones de couleur sur un plateau,
cherchant à regrouper 10 hexagones identiques en tête pour les effacer et gagner des points.
Les points se dépensent pour étendre le plateau.

## Économie des points
- Gain par clear : 10 + (n-10)² pts (n = hexagones effacés), × multiplicateur combo
- Bonus transferts : fib(n-1) pour n≥3 transferts dans un move
- Multiplicateur pile vidée : ×1.5 (1 pile) ou ×2 (2+) si des piles se vident pendant un move
- Annuler : 5 pts
- Actions (Swap/Bubble/Trim) : coût de base + 50 pts par utilisation précédente

## Cases verrouillées — types et probabilités
Chaque nouvelle case révélée reçoit un type aléatoire, et un `revealOrder` (= map.size au moment de
sa création) qui incrémente légèrement son seuil/coût via `1 + ln(order) × 0.8`.

| Type                    | Proba | Coût/seuil            | Visuel                              |
|-------------------------|-------|-----------------------|-------------------------------------|
| Auto + pile 3 couleurs  | 10%   | seuil ×1.5            | ghost pile, seuil en bas            |
| Auto + pile 4 couleurs  | 57%   | seuil ×1              | ghost pile, seuil en bas            |
| Auto + pile 5 couleurs  | 10%   | seuil ×0.5            | ghost pile, seuil en bas            |
| Auto vide               |  3%   | seuil ×2              | seuil centré                        |
| Payante vide            | 20%   | coût ×1               | 🔒 + coût en pts                    |

Auto = se débloque automatiquement quand le score atteint le seuil ET que la case est "prête".
Payante = clic/tap du joueur, déduit le coût du solde.

Une case verrouillée n'est "prête" que si elle est adjacente à une case vide débloquée
OU à une case qui a reçu un transfert lors du dernier move (`lastTransferred` Set).
Les cases non-prêtes sont affichées à 45% d'opacité, sans ghost.

## Coût par vague
baseCostForWave(w) = round(100 × 1.45^(w-1)) × orderMult
  wave 1 → ~100 pts, wave 2 → ~145, wave 3 → ~210, wave 4 → ~305 …
orderMult = 1 + ln(revealOrder) × 0.8 — croît avec le nb de cases déjà révélées.

## Progression (basée sur moveCount)
Moves  0–9  : 4 couleurs (magenta,menthe,bleu,jaune), max 2 couleurs/pile
Moves 10–19 : +violet (5 couleurs), max 2 couleurs/pile
Moves 20–34 : 5 couleurs, max 3 couleurs/pile
Moves 35–49 : +turquoise (6 couleurs), max 3 couleurs/pile
Moves 50–69 : +blanc (7 couleurs), max 3 couleurs/pile
Moves 70+   : +noir (8 couleurs), max 3 couleurs/pile

## Rendu des tuiles (style référence)
Chaque tuile = dark hex (rimDark) décalé de SIDE_D px vers le bas + gradient hex par-dessus.
Le dark hex qui dépasse crée le séparateur naturel entre tuiles — pas de path explicite.
Drop shadow sur `Stack3D` via `filter="url(#stackShadow)"`.
Highlight radial sur la face de chaque tuile (url(#hxHL{id})).
Le prix des cases auto est toujours affiché (petit, bas de la case).
Le 🔒 + prix des cases payantes est affiché par-dessus la ghost pile.

## Architecture
- React hooks + SVG pur, fichier .jsx autonome
- hexPts : vertices avec HEX_YS=0.62 (aplatissement vertical)
- rhp : path face arrondi (quadratic bezier, cr=9)
- sidePath : path mur latéral (utilisé pour cases floor, pas pour tuiles de pile)
- Z-order : cases triées par Y pixel (algorithme du peintre)
- live.current : ref avec tout l'état courant → handlers touch/mouse jamais périmés
- computeSteps : retourne steps {transfer|clear} avec snapshots before/after
  + transferCount, emptiedCount pour calcul des bonus
- Animation séquentielle via playRef.current avec setTimeout
  Clear steps créditent les points inline ; bonus/multiplicateur à la fin
- pendingPreStacks.current : piles auto-unlock arrivant pendant une animation,
  appliquées sur finalBoard à la fin

Constantes : R=42, HEX_YS=0.62, LAYER_H=6, MAX_VIS=6, SIDE_D=4, CLEAR_AT=10,
             UNDO_COST=5, VIEWPORT=500×360, VGRID=31×31
*/

import { useState, useEffect, useRef, useMemo } from "react";

// ── Palette (8 couleurs, débloquées progressivement) ─────────────────────────
const COLORS = [
  {id:0,top:"#EF7090",topDark:"#E04878",side:"#C03058",rimDark:"#991C4E",glow:"#ff4499",label:"Magenta"},
  {id:1,top:"#7EEAB4",topDark:"#38B870",side:"#209858",rimDark:"#105830",glow:"#1abc9c",label:"Menthe"},
  {id:2,top:"#90C8FF",topDark:"#5088E0",side:"#3068B8",rimDark:"#1A4090",glow:"#3498db",label:"Bleu"},
  {id:3,top:"#FFE899",topDark:"#E8B830",side:"#C09000",rimDark:"#8A6800",glow:"#f39c12",label:"Jaune"},
  {id:4,top:"#D8A8FF",topDark:"#A060E0",side:"#7030B8",rimDark:"#4A1880",glow:"#9b59b6",label:"Violet"},
  {id:5,top:"#80F0F0",topDark:"#20C0C8",side:"#089098",rimDark:"#055860",glow:"#00bcd4",label:"Turquoise"},
  {id:6,top:"#F5F5F8",topDark:"#C8C8D4",side:"#9090A8",rimDark:"#606070",glow:"#ecf0f1",label:"Blanc"},
  {id:7,top:"#686878",topDark:"#404050",side:"#282830",rimDark:"#101018",glow:"#2c2c3c",label:"Noir"},
];
const NC_TOTAL = COLORS.length;

// ── Progression ───────────────────────────────────────────────────────────────
function getProgression(moves) {
  let nc, maxColors;
  if      (moves < 10) { nc = 4; maxColors = 2; }
  else if (moves < 20) { nc = 5; maxColors = 2; }
  else if (moves < 35) { nc = 5; maxColors = 3; }
  else if (moves < 50) { nc = 6; maxColors = 3; }
  else if (moves < 70) { nc = 7; maxColors = 3; }
  else                 { nc = 8; maxColors = 3; }
  return { nc, maxColors };
}

// ── Grid constants ────────────────────────────────────────────────────────────
const R=42, CW=R*1.5, HEX_YS=0.62;
const HH=Math.sqrt(3)*R*HEX_YS;
const LAYER_H=6, MAX_VIS=6, SIDE_D=4;
const PAD_H=R+20, PAD_V=MAX_VIS*LAYER_H+R+30;
const VIEWPORT_W=500, VIEWPORT_H=360;
const CLEAR_AT=10;
const UNDO_COST=5;
const VROWS=31, VCOLS=31;
const OC=15, OR=15;

function cellXY(col,row){ return [PAD_H+col*CW, PAD_V+row*HH+(col%2?HH/2:0)]; }
const [OX,OY]=cellXY(OC,OR);
const INIT_PAN={x:VIEWPORT_W/2-OX, y:VIEWPORT_H/2-OY};

// ── Geometry ──────────────────────────────────────────────────────────────────
function hexPts(cx,cy,r){
  return Array.from({length:6},(_,i)=>{
    const a=(Math.PI/3)*i; return [cx+r*Math.cos(a), cy+r*Math.sin(a)*HEX_YS];
  });
}
function rhp(cx,cy,r,cr=9){
  const v=hexPts(cx,cy,r),f=n=>n.toFixed(1); let d="";
  for(let i=0;i<6;i++){
    const p=v[(i-1+6)%6],c=v[i],n=v[(i+1)%6];
    const d1=Math.hypot(c[0]-p[0],c[1]-p[1]),d2=Math.hypot(n[0]-c[0],n[1]-c[1]);
    const ax=c[0]-(c[0]-p[0])/d1*cr,ay=c[1]-(c[1]-p[1])/d1*cr;
    const bx=c[0]+(n[0]-c[0])/d2*cr,by=c[1]+(n[1]-c[1])/d2*cr;
    d+=(i===0?`M${f(ax)},${f(ay)}`:`L${f(ax)},${f(ay)}`)+` Q${f(c[0])},${f(c[1])} ${f(bx)},${f(by)}`;
  }
  return d+"Z";
}
function sidePath(cx,cy,r,depth,cr=9){
  const v=hexPts(cx,cy,r),f=n=>n.toFixed(1);
  function qp(i){
    const p=v[(i-1+6)%6],c=v[i],n=v[(i+1)%6];
    const d1=Math.max(.001,Math.hypot(c[0]-p[0],c[1]-p[1]));
    const d2=Math.max(.001,Math.hypot(n[0]-c[0],n[1]-c[1]));
    return{ax:c[0]-(c[0]-p[0])/d1*cr,ay:c[1]-(c[1]-p[1])/d1*cr,
           bx:c[0]+(n[0]-c[0])/d2*cr,by:c[1]+(n[1]-c[1])/d2*cr,qx:c[0],qy:c[1]};
  }
  const c0=qp(0),c1=qp(1),c2=qp(2),c3=qp(3),D=depth;
  return `M${f(c0.ax)},${f(c0.ay)} Q${f(c0.qx)},${f(c0.qy)} ${f(c0.bx)},${f(c0.by)}`
    +` L${f(c1.ax)},${f(c1.ay)} Q${f(c1.qx)},${f(c1.qy)} ${f(c1.bx)},${f(c1.by)}`
    +` L${f(c2.ax)},${f(c2.ay)} Q${f(c2.qx)},${f(c2.qy)} ${f(c2.bx)},${f(c2.by)}`
    +` L${f(c3.ax)},${f(c3.ay)} Q${f(c3.qx)},${f(c3.qy)} ${f(c3.bx)},${f(c3.by)}`
    +` L${f(c3.bx)},${f(c3.by+D)} Q${f(c3.qx)},${f(c3.qy+D)} ${f(c3.ax)},${f(c3.ay+D)}`
    +` L${f(c2.bx)},${f(c2.by+D)} Q${f(c2.qx)},${f(c2.qy+D)} ${f(c2.ax)},${f(c2.ay+D)}`
    +` L${f(c1.bx)},${f(c1.by+D)} Q${f(c1.qx)},${f(c1.qy+D)} ${f(c1.ax)},${f(c1.ay+D)}`
    +` L${f(c0.bx)},${f(c0.by+D)} Q${f(c0.qx)},${f(c0.qy+D)} ${f(c0.ax)},${f(c0.ay+D)}Z`;
}

function topOf(s){ return s.length?s[s.length-1]:null; }
function cp(b){ return b.map(r=>r.map(c=>[...c])); }
function initBoard(){ return Array.from({length:VROWS},()=>Array.from({length:VCOLS},()=>[])); }

// ── Adjacency ─────────────────────────────────────────────────────────────────
function getNeighbors(row,col){
  const dr=col%2===1?1:-1;
  return[[row-1,col],[row+1,col],[row,col-1],[row+dr,col-1],[row,col+1],[row+dr,col+1]]
    .filter(([r,c])=>r>=0&&r<VROWS&&c>=0&&c<VCOLS);
}

// ── Wave-based cost ───────────────────────────────────────────────────────────
// Cost depends only on the wave (generation) in which a cell was revealed.
// Wave 1 = first ring around starting cluster, wave 2 = next ring, etc.
// Formula: 100 × 1.45^(wave-1), rounded, so:
//   wave 1 → 100, wave 2 → 145, wave 3 → 210, wave 4 → 305, wave 5 → 442 ...
function baseCostForWave(wave){ return Math.round(100*Math.pow(1.45,wave-1)); }
function clearPts(n){ return 10+Math.pow(n-CLEAR_AT,2); }
// Combo multiplier: ×1 for first, ×1.5 for second, ×2 for third+
function comboMult(c){ return c<=1?1:c===2?1.5:2; }

// ── Stack generation ──────────────────────────────────────────────────────────
function rndStack(progression){
  const{nc,maxColors}=progression;
  const total=2+Math.floor(Math.random()*4);
  const numColors=1+Math.floor(Math.random()*Math.min(maxColors,nc));
  const pool=[];
  while(pool.length<numColors){
    const c=Math.floor(Math.random()*nc);
    if(!pool.includes(c)) pool.push(c);
  }
  for(let i=pool.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1)); [pool[i],pool[j]]=[pool[j],pool[i]];
  }
  const sizes=Array(numColors).fill(1);
  for(let k=numColors;k<total;k++) sizes[Math.floor(Math.random()*numColors)]++;
  const arr=[];
  for(let i=0;i<numColors;i++) for(let j=0;j<sizes[i];j++) arr.push(pool[i]);
  return arr;
}

// Generate a pre-stack for a locked cell (slightly simpler than regular stacks)
function rndPreStack(progression){
  const{nc}=progression;
  const ncForPre=Math.min(nc,4); // pre-stacks use at most 4 colors for variety
  const proj={nc:ncForPre,maxColors:Math.min(2,progression.maxColors)};
  return rndStack(proj);
}

// ── CellMap init & neighbor reveal ───────────────────────────────────────────
// cellMap entry: { state, cost, wave, preStack?, autoUnlock? }

function makeLockedCell(wave, progression, revealOrder=1){
  const base=baseCostForWave(wave);
  // Each cell revealed gets slightly more expensive based on order
  const orderMult=1+Math.log1p(revealOrder-1)*0.8;
  const scaledBase=Math.round(base*orderMult);
  const rnd=Math.random();

  function preStackN(nc){
    const n=Math.min(nc,Math.max(1,progression.nc));
    return rndPreStack({nc:n,maxColors:Math.min(n,progression.maxColors)});
  }

  // 10%: auto + pile 3 couleurs, seuil ×1.5
  if(rnd<0.10){
    return{state:'locked',cost:0,wave,revealOrder,
      autoUnlock:Math.max(60,Math.round(scaledBase*1.5+40)),preStack:preStackN(3)};
  }
  // 50%: auto + pile 4 couleurs, seuil ×1
  if(rnd<0.67){
    return{state:'locked',cost:0,wave,revealOrder,
      autoUnlock:Math.max(40,Math.round(scaledBase*1.0+25)),preStack:preStackN(4)};
  }
  // 10%: auto + pile 5 couleurs, seuil ×0.5
  if(rnd<0.77){
    return{state:'locked',cost:0,wave,revealOrder,
      autoUnlock:Math.max(20,Math.round(scaledBase*0.5+15)),preStack:preStackN(5)};
  }
  // 3%: auto vide, seuil ×2
  if(rnd<0.80){
    return{state:'locked',cost:0,wave,revealOrder,
      autoUnlock:Math.max(100,Math.round(scaledBase*2.0+60))};
  }
  // 20%: payante vide, coût ×1 — rare, premium
  return{state:'locked',cost:Math.max(20,scaledBase),wave,revealOrder};
}

// Reveal unvisited neighbors of a newly unlocked cell at wave+1
function revealNeighbors(map,row,col,parentWave,progression){
  const childWave=parentWave+1;
  const toReveal=getNeighbors(row,col)
    .filter(([nr,nc])=>!map.has(`${nr},${nc}`)&&nr>=0&&nr<VROWS&&nc>=0&&nc<VCOLS);
  // Shuffle so order-based cost is random within a batch
  for(let i=toReveal.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [toReveal[i],toReveal[j]]=[toReveal[j],toReveal[i]];
  }
  toReveal.forEach(([nr,nc])=>{
    const order=map.size+1; // increments naturally as we add
    map.set(`${nr},${nc}`,makeLockedCell(childWave,progression,order));
  });
}

function initCellMap(){
  // Grow a random connected cluster of exactly 10 cells from center
  const unlocked=new Set([`${OR},${OC}`]);
  const frontier=getNeighbors(OR,OC).map(([r,c])=>`${r},${c}`);
  while(unlocked.size<10&&frontier.length>0){
    const idx=Math.floor(Math.random()*frontier.length);
    const k=frontier.splice(idx,1)[0];
    if(unlocked.has(k))continue;
    unlocked.add(k);
    const[r,c]=k.split(',').map(Number);
    getNeighbors(r,c).forEach(([nr,nc])=>{
      const nk=`${nr},${nc}`;
      if(!unlocked.has(nk)&&!frontier.includes(nk))frontier.push(nk);
    });
  }
  const m=new Map();
  unlocked.forEach(k=>m.set(k,{state:'unlocked',cost:0,wave:0}));

  const startProg=getProgression(0);

  // Ring 1 (wave 1)
  const ring1=new Set();
  unlocked.forEach(k=>{
    const[r,c]=k.split(',').map(Number);
    getNeighbors(r,c).forEach(([nr,nc])=>{
      const nk=`${nr},${nc}`; if(!unlocked.has(nk))ring1.add(nk);
    });
  });
  const ring1arr=[...ring1].sort(()=>Math.random()-0.5);
  ring1arr.forEach(k=>{
    const[r,c]=k.split(',').map(Number);
    m.set(k,makeLockedCell(1,startProg,m.size+1));
  });

  // Ring 2 (wave 2)
  const ring2=new Set();
  ring1.forEach(k=>{
    const[r,c]=k.split(',').map(Number);
    getNeighbors(r,c).forEach(([nr,nc])=>{
      const nk=`${nr},${nc}`;
      if(!unlocked.has(nk)&&!ring1.has(nk)&&!m.has(nk))ring2.add(nk);
    });
  });
  const ring2arr=[...ring2].sort(()=>Math.random()-0.5);
  ring2arr.forEach(k=>{
    const[r,c]=k.split(',').map(Number);
    m.set(k,makeLockedCell(2,startProg,m.size+1));
  });

  return m;
}

// ── BFS cascade ───────────────────────────────────────────────────────────────
// ── Fibonacci transfer bonus ──────────────────────────────────────────────────
// transferBonus(n) = fib(n-1) for n>=3, 0 otherwise
function transferBonus(n){
  if(n<3) return 0;
  let a=1,b=1;
  for(let i=2;i<n-1;i++){const t=a+b;a=b;b=t;}
  return b;
}
// Empty-stack multiplier: ×1.5 for 1 emptied, ×2 for 2+
function emptyMult(emptied){ return emptied===0?1:emptied===1?1.5:2; }

function computeSteps(boardIn,tr,tc,incoming){
  const board=cp(boardIn);
  board[tr][tc]=[...board[tr][tc],...incoming];
  const steps=[],queue=[[tr,tc]];
  const inQ=new Set([`${tr},${tc}`]),active=new Set();
  let totalCleared=0,transferCount=0;
  const emptiedCells=new Set(); // keys of cells emptied by transfers

  while(queue.length){
    const[r,c]=queue.shift(),key=`${r},${c}`;
    inQ.delete(key); if(active.has(key))continue; active.add(key);
    let changed=true;
    while(changed){
      changed=false;
      const tgt=board[r][c],topC=topOf(tgt); if(topC===null)break;
      for(const[r2,c2]of getNeighbors(r,c)){
        const src=board[r2][c2];
        if(!src.length||topOf(src)!==topC)continue;
        let cnt=0; for(let i=src.length-1;i>=0&&src[i]===topC;i--)cnt++;
        for(let k=0;k<cnt;k++){
          const before=cp(board); src.pop(); tgt.push(topC);
          transferCount++;
          if(src.length===0) emptiedCells.add(`${r2},${c2}`);
          steps.push({type:"transfer",from:[r2,c2],to:[r,c],color:topC,before,after:cp(board)});
        }
        changed=true; const sk=`${r2},${c2}`; active.delete(sk);
        if(!inQ.has(sk)){queue.push([r2,c2]);inQ.add(sk);}
      }
      const topC2=topOf(tgt);
      if(topC2!==null){
        let cnt=0; for(let i=tgt.length-1;i>=0&&tgt[i]===topC2;i--)cnt++;
        if(cnt>=CLEAR_AT){
          const before=cp(board); tgt.splice(tgt.length-cnt,cnt); totalCleared+=cnt;
          const[cx,cy]=cellXY(c,r);
          steps.push({type:"clear",at:[r,c],color:topC2,count:cnt,
            clearPtsBase:clearPts(cnt), popX:cx, popY:cy,
            before,after:cp(board)});
          changed=true;
        }
      }
    }
  }
  return{steps,finalBoard:board,totalCleared,transferCount,
    emptiedCount:emptiedCells.size};
}

// ── SVG Components ────────────────────────────────────────────────────────────
function Tile({cx,cy,dy=0,colorId,isTop,topRun=0,r=R-2,depth=SIDE_D,opacity=1}){
  const col=COLORS[colorId],oy=cy+dy;
  return (
    <g opacity={opacity}>
      {/* Dark underside hex — offset down by depth, peeks below tile above = separator */}
      <path d={rhp(cx,oy+depth,r)} fill={col.rimDark}/>
      {/* Face — gradient */}
      <path d={rhp(cx,oy,r)} fill={`url(#hxT${colorId})`}/>
      {/* Radial highlight */}
      <path d={rhp(cx,oy,r)} fill={`url(#hxHL${colorId})`}/>
      {isTop&&topRun>0&&(
        <text x={cx} y={oy} textAnchor="middle" dominantBaseline="central"
          fill="white" fontSize={20} fontWeight={900}
          fontFamily="Arial Rounded MT Bold, Nunito, system-ui, sans-serif"
          style={{pointerEvents:"none",userSelect:"none",
            filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.5))"}}>
          {topRun}
        </text>
      )}
    </g>
  );
}

function Stack3D({stack,cx,cy,ghost=false}){
  const topC=topOf(stack);
  let topRun=0; if(topC!==null) for(let i=stack.length-1;i>=0&&stack[i]===topC;i--)topRun++;
  const topIdx=stack.length-1;
  return (
    <g filter={ghost?"none":"url(#stackShadow)"} opacity={ghost?0.55:1}>
      {stack.map((cid,i)=>(
        <Tile key={i} cx={cx} cy={cy} dy={-(i*LAYER_H)} colorId={cid}
          isTop={i===topIdx} topRun={i===topIdx?topRun:0}/>
      ))}
    </g>
  );
}


function FloorHex({cx,cy,locked,cost,autoUnlock,preStack,canAfford,isReady,isHL,isDonor,isGlow,dragActive,selTop,isToolTarget,isSwapFirst}){
  const r=R-2;
  if(locked){
    const isAuto=autoUnlock!=null;
    const ready=isReady;
    // Unified neutral style — no gold for auto, same as paid
    const sideCol=ready?"rgba(180,205,228,0.5)":"rgba(160,190,215,0.22)";
    const topCol=preStack
      ?(ready?"rgba(200,225,245,0.62)":"rgba(185,210,235,0.28)")
      :(ready?"rgba(210,230,248,0.72)":"rgba(195,220,240,0.28)");
    const strokeCol=ready?"rgba(155,195,225,0.7)":"rgba(140,175,205,0.18)";
    return (
      <g style={{cursor:ready&&!isAuto?canAfford?"pointer":"not-allowed":"default",
        opacity:ready?1:0.45}}>
        {preStack&&preStack.length>0&&ready&&
          <Stack3D stack={preStack} cx={cx} cy={cy} ghost={true}/>}
        <path d={sidePath(cx,cy,r,SIDE_D)} fill={sideCol}/>
        <path d={rhp(cx,cy,r)} fill={topCol} stroke={strokeCol} strokeWidth={0.8}/>
        {!isAuto&&(
          /* Paid cell: lock + cost. If it has a preStack the cost sits below the ghost. */
          <>
            <text x={cx} y={preStack?cy-6:cy-5} textAnchor="middle" dominantBaseline="central"
              fill={ready?"#4a80a8":"#6080a0"} fontSize={14} style={{pointerEvents:"none"}}>🔒</text>
            <text x={cx} y={preStack?cy+9:cy+10} textAnchor="middle" dominantBaseline="central"
              fill={ready?"#5a8ab0":"#7890a8"} fontSize={10} fontWeight={800}
              fontFamily="system-ui,sans-serif" style={{pointerEvents:"none"}}>
              {cost.toLocaleString()}
            </text>
          </>
        )}
        {isAuto&&(
          /* Auto cell: always show threshold — small, bottom of cell */
          <text x={cx} y={cy+(preStack?9:0)} textAnchor="middle" dominantBaseline="central"
            fill={ready?"rgba(70,120,168,0.75)":"rgba(90,120,155,0.45)"}
            fontSize={preStack?9:10} fontWeight={700}
            fontFamily="system-ui,sans-serif" style={{pointerEvents:"none"}}>
            {autoUnlock.toLocaleString()}
          </text>
        )}
      </g>
    );
  }
  const topFill=isHL?"#ffffff":isDonor?"#e4f2ff":dragActive?"#edf5ff":"#ddeef8";
  const sideFill=isHL?"#a4c8e8":isDonor?"#9cc4e4":"#b8d4ea";
  const topStroke=isHL?"#3aaeee":isDonor&&selTop!=null?COLORS[selTop].glow:"rgba(155,195,225,0.7)";
  const sw=isHL?2:isDonor?1.5:0.7;
  return (
    <g>
      <path d={sidePath(cx,cy,r,SIDE_D)} fill={sideFill}/>
      <path d={rhp(cx,cy,r)} fill={topFill} stroke={topStroke} strokeWidth={sw}
        style={isGlow?{animation:"clrPulse 0.5s ease-in-out"}:undefined}/>
      {/* Subtle highlight on floor cells */}
      <path d={rhp(cx,cy,r)} fill="url(#floorHL)"/>
      {isHL&&<path d={rhp(cx,cy,r+5)} fill="none" stroke="#3aaeee" strokeWidth={2} opacity={0.5}/>}
      {isDonor&&!isHL&&selTop!=null&&
        <path d={rhp(cx,cy,r+5)} fill="none" stroke={COLORS[selTop].glow} strokeWidth={1.5} opacity={0.35}/>}
      {isSwapFirst&&<path d={rhp(cx,cy,r+6)} fill="none" stroke="#f1c40f" strokeWidth={2.5} opacity={0.9}/>}
      {isToolTarget&&!isSwapFirst&&!isHL&&
        <path d={rhp(cx,cy,r+4)} fill="rgba(255,200,50,0.08)" stroke="#e8a000" strokeWidth={1.5} opacity={0.6}
          style={{animation:"toolPulse 1s ease-in-out infinite"}}/>}
      {dragActive&&!isHL&&
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central"
          fill="rgba(80,140,195,0.2)" fontSize={26} style={{pointerEvents:"none"}}>+</text>}
    </g>
  );
}

function FlyHex({fromCol,fromRow,toCol,toRow,color,panX,panY}){
  const[fx,fy]=cellXY(fromCol,fromRow),[tx,ty]=cellXY(toCol,toRow);
  const col=COLORS[color],r=R-4;
  return (
    <g style={{filter:`drop-shadow(0 0 8px ${col.glow})`}}>
      <animateTransform attributeName="transform" type="translate"
        from={`${fx+panX} ${fy+panY}`} to={`${tx+panX} ${ty+panY}`}
        dur="0.12s" fill="freeze" calcMode="spline"
        keySplines="0.25 0.1 0.25 1" keyTimes="0;1"/>
      <path d={sidePath(0,0,r,SIDE_D)} fill={col.side}/>
      <path d={rhp(0,0,r)} fill={col.top}/>
    </g>
  );
}

// ── Incoming layout ───────────────────────────────────────────────────────────
const INC_CY=MAX_VIS*LAYER_H+R+2;
const INC_H=Math.ceil(INC_CY+R+SIDE_D+4);
const INC_GAP=CW*2;
const INC_START=(VIEWPORT_W-INC_GAP*2)/2;
const INC_CX=[INC_START, INC_START+INC_GAP, INC_START+INC_GAP*2];

// ── Snapshot for undo ─────────────────────────────────────────────────────────
function snap(board,incoming,cellMap,points,cleared,moveCount,combo){
  return{board:cp(board),incoming:[...incoming.map(s=>[...s])],
    cellMap:new Map(cellMap),points,cleared,moveCount,combo};
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HexStack(){
  const[board,setBoard]             =useState(initBoard);
  const[incoming,setIncoming]       =useState(()=>{
    const p=getProgression(0);
    return[rndStack(p),rndStack(p),rndStack(p)];
  });
  const[cellMap,setCellMap]         =useState(initCellMap);
  const[points,setPoints]           =useState(0);
  const[cleared,setCleared]         =useState(0);
  const[combo,setCombo]             =useState(0);
  const[moveCount,setMoveCount]     =useState(0);
  const[popups,setPopups]           =useState([]);
  const[glowing,setGlowing]         =useState(new Set());
  const[newUnlocks,setNewUnlocks]   =useState(new Set());
  const[lastTransferred,setLastTransferred]=useState(new Set()); // "row,col" keys
  const[isAnimating,setIsAnim]      =useState(false);
  const[flyHex,setFlyHex]           =useState(null);
  const[dragging,setDragging]       =useState(null);
  const[panning,setPanning]         =useState(false);
  const[panOffset,setPanOffset]     =useState(INIT_PAN);
  const[dragPos,setDragPos]         =useState({x:0,y:0});
  const[dropHL,setDropHL]           =useState(null);
  const[history,setHistory]         =useState([]);
  const[gameOver,setGameOver]       =useState(false);
  const[cantAffordKey,setCantAfford]=useState(null);
  const[activeTool,setActiveTool]   =useState(null);
  const[swapFirst,setSwapFirst]     =useState(null);
  const[actionUsages,setActionUsages]=useState({swap:0,bubble:0,trim:0});

  const boardSvgRef=useRef(null);
  const cardRefs   =useRef([null,null,null]);
  const live       =useRef({});
  const panStart   =useRef(null);
  const clickStart =useRef(null);
  const pendingPreStacks=useRef([]);
  const cbRef      =useRef({});
  live.current={board,incoming,cellMap,points,cleared,moveCount,combo,
    isAnimating,dragging,panning,panOffset,history,gameOver,activeTool,lastTransferred};

  // Which locked cells are "ready" (adjacent to empty unlocked OR to lastTransferred)
  const readyCells=useMemo(()=>{
    const s=new Set();
    cellMap.forEach((cell,k)=>{
      if(cell.state!=='locked') return;
      const[r,c]=k.split(',').map(Number);
      const ready=getNeighbors(r,c).some(([nr,nc])=>{
        const nk=`${nr},${nc}`;
        const info=cellMap.get(nk);
        if(!info||info.state!=='unlocked') return false;
        return board[nr][nc].length===0 || lastTransferred.has(nk);
      });
      if(ready) s.add(k);
    });
    return s;
  },[cellMap,board,lastTransferred]);

  // ── Auto-unlock cells when points threshold is reached ───────────────────
  useEffect(()=>{
    const{cellMap:cm,board:b,moveCount:mc,lastTransferred:lt,isAnimating:anim}=live.current;
    if(anim) return; // don't overwrite board during animation
    function isReady(row,col){
      return getNeighbors(row,col).some(([nr,nc])=>{
        const nk=`${nr},${nc}`;
        const info=cm.get(nk);
        if(!info||info.state!=='unlocked') return false;
        return b[nr][nc].length===0 || (lt&&lt.has(nk));
      });
    }
    const toUnlock=[];
    cm.forEach((cell,k)=>{
      if(cell.state==='locked'&&cell.autoUnlock!=null&&points>=cell.autoUnlock){
        const[r,c]=k.split(',').map(Number);
        if(isReady(r,c)) toUnlock.push({k,cell,r,c});
      }
    });
    if(!toUnlock.length)return;
    const newMap=new Map(cm);
    const unlockKeys=new Set();
    const prog=getProgression(mc);
    // Build updated board — but only commit immediately if not animating
    let newBoard=cp(b);
    toUnlock.forEach(({k,cell,r,c})=>{
      newMap.set(k,{state:'unlocked',cost:0,wave:cell.wave??1});
      unlockKeys.add(k);
      revealNeighbors(newMap,r,c,cell.wave??1,prog);
      if(cell.preStack&&cell.preStack.length>0){
        newBoard[r][c]=[...cell.preStack];
      }
    });
    setCellMap(newMap);
    // If animating, the playRef will finish and call setBoard(finalBoard).
    // We patch finalBoard via a one-shot interceptor so preStacks survive.
    if(!anim){
      setBoard(newBoard);
    } else {
      // Merge preStacks into the pending finalBoard by overriding setBoard next call
      pendingPreStacks.current=[...toUnlock.map(({r,c,cell})=>({r,c,stack:cell.preStack}))
        .filter(x=>x.stack&&x.stack.length>0)];
    }
    setNewUnlocks(unlockKeys);
    setTimeout(()=>setNewUnlocks(new Set()),800);
  },[points, isAnimating]); // eslint-disable-line react-hooks/exhaustive-deps
  const[newColorBanner,setNewColorBanner]=useState(null);
  useEffect(()=>{
    const prev=getProgression(Math.max(0,moveCount-1));
    const curr=getProgression(moveCount);
    if(curr.nc>prev.nc){
      setNewColorBanner(COLORS[curr.nc-1].label);
      setTimeout(()=>setNewColorBanner(null),2500);
    }
  },[moveCount]);

  // ── Z-sorted cells ────────────────────────────────────────────────────────
  const cellsByY=useMemo(()=>{
    const arr=[];
    cellMap.forEach((_,k)=>{
      const[row,col]=k.split(',').map(Number);
      const[,cy]=cellXY(col,row);
      arr.push({row,col,cy,key:k});
    });
    return arr.sort((a,b)=>a.cy-b.cy);
  },[cellMap]);

  // ── Hit-tests ─────────────────────────────────────────────────────────────
  function clientToEmptyCell(cx,cy){
    const el=boardSvgRef.current; if(!el)return null;
    const rect=el.getBoundingClientRect();
    const{panOffset:{x:ox,y:oy},cellMap:cm,board:b}=live.current;
    const sx=cx-rect.left-ox,sy=cy-rect.top-oy;
    let best=null,bestD=Infinity;
    cm.forEach((cell,k)=>{
      if(cell.state!=='unlocked')return;
      const[r,c]=k.split(',').map(Number);
      if(b[r][c].length>0)return;
      const[hx,hy]=cellXY(c,r),d=Math.hypot(sx-hx,sy-hy);
      if(d<bestD){bestD=d;best=[r,c];}
    });
    return bestD<R*1.2?best:null;
  }

  function clientToCellAny(cx,cy){
    const el=boardSvgRef.current; if(!el)return null;
    const rect=el.getBoundingClientRect();
    const{panOffset:{x:ox,y:oy},cellMap:cm}=live.current;
    const sx=cx-rect.left-ox,sy=cy-rect.top-oy;
    let best=null,bestD=Infinity;
    cm.forEach((cell,k)=>{
      const[r,c]=k.split(',').map(Number);
      const[hx,hy]=cellXY(c,r),d=Math.hypot(sx-hx,sy-hy);
      if(d<bestD){bestD=d;best={row:r,col:c,key:k,cell};}
    });
    return bestD<R*1.2?best:null;
  }

  // ── Unlock a locked cell ──────────────────────────────────────────────────
  function tryUnlock(key,cell){
    const{points:pts,cellMap:cm,board:b,history:hist,cleared:clr,
          moveCount:mc,incoming:inc,combo:cmb,lastTransferred:lt}=live.current;
    if(cell.state!=='locked'||cell.autoUnlock!=null)return;
    const[r,c]=key.split(',').map(Number);
    // Only allow unlock if adjacent to empty unlocked cell or lastTransferred
    const ready=getNeighbors(r,c).some(([nr,nc])=>{
      const nk=`${nr},${nc}`;
      const info=cm.get(nk);
      if(!info||info.state!=='unlocked') return false;
      return b[nr][nc].length===0 || (lt&&lt.has(nk));
    });
    if(!ready) return;
    if(pts<cell.cost){
      setCantAfford(key); setTimeout(()=>setCantAfford(null),500); return;
    }
    setHistory([...hist,snap(b,inc,cm,pts,clr,mc,cmb)].slice(-5));
    const newPts=pts-cell.cost;
    const newMap=new Map(cm);
    newMap.set(key,{state:'unlocked',cost:cell.cost,wave:cell.wave??1});
    const prog=getProgression(mc);
    revealNeighbors(newMap,r,c,cell.wave??1,prog);
    setCellMap(newMap);
    setPoints(newPts);
    setNewUnlocks(new Set([key]));
    setTimeout(()=>setNewUnlocks(new Set()),700);

    if(cell.preStack&&cell.preStack.length>0){
      // Run full cascade from this cell with preStack as incoming
      const{steps,finalBoard,totalCleared:nc,transferCount,emptiedCount}=
        computeSteps(b,r,c,cell.preStack);
      applyLastTransferred(steps);
      const newCombo=nc>0?cmb+1:0;
      setCombo(newCombo);
      const tBonus=transferBonus(transferCount);
      const eMult=emptyMult(emptiedCount);
      const[px,py]=cellXY(c,r);
      let bonusInfo=null;
      if(nc>0&&emptiedCount>0){
        const totalBase=steps.filter(s=>s.type==='clear')
          .reduce((sum,s)=>sum+Math.round(s.clearPtsBase*comboMult(newCombo)),0);
        const extra=Math.round(totalBase*(eMult-1));
        if(extra>0){bonusInfo={x:px,y:py-30,pts:extra,label:`×${eMult}`,type:'mult'};
          setTimeout(()=>setPoints(p=>p+extra),steps.length*(120+20)+300);}
      } else if(tBonus>0){
        bonusInfo={x:px,y:py-30,pts:tBonus,label:`+${tBonus} bonus`,type:'transfer'};
        setTimeout(()=>setPoints(p=>p+tBonus),steps.length*(120+20)+200);
      }
      if(!steps.length){
        setBoard(finalBoard);
        if(tBonus>0){setPoints(p=>p+tBonus);}
        checkGameOver(finalBoard,newMap);
      }else{
        setBoard(steps[0].before);setIsAnim(true);
        playRef.current(steps,0,finalBoard,newMap,newCombo,bonusInfo);
      }
    }else{
      checkGameOver(b,newMap);
    }
  }

  // ── Animation engine ──────────────────────────────────────────────────────
  const playRef=useRef(null);
  playRef.current=function play(steps,idx,finalBoard,finalCm,comboVal,bonusInfo){
    if(idx>=steps.length){
      setIsAnim(false);setFlyHex(null);
      // Apply any preStacks that auto-unlocked during the animation
      let committed=finalBoard;
      if(pendingPreStacks.current.length>0){
        committed=cp(finalBoard);
        pendingPreStacks.current.forEach(({r,c,stack})=>{
          if(committed[r][c].length===0) committed[r][c]=[...stack];
        });
        pendingPreStacks.current=[];
      }
      setBoard(committed);
      // Show bonus popup AFTER all animations
      if(bonusInfo&&bonusInfo.pts>0){
        const id=Date.now()+Math.random();
        setPopups(p=>[...p,{id,...bonusInfo}]);
        setTimeout(()=>setPopups(p=>p.filter(x=>x.id!==id)),1800);
      }
      checkGameOver(committed,finalCm);
      return;
    }
    const s=steps[idx];
    const next=()=>playRef.current(steps,idx+1,finalBoard,finalCm,comboVal,bonusInfo);
    if(s.type==="transfer"){
      setBoard(s.before);
      setFlyHex({fromCol:s.from[1],fromRow:s.from[0],toCol:s.to[1],toRow:s.to[0],color:s.color,key:idx});
      setTimeout(()=>{setBoard(s.after);setFlyHex(null);setTimeout(next,20);},120);
    }else{
      // Clear step: flash + show inline points popup for this clear
      setBoard(s.before);
      const gk=`${s.at[0]}-${s.at[1]}`;
      setGlowing(p=>new Set([...p,gk]));
      // Inline popup: base clear pts × combo
      const inlinePts=Math.round(s.clearPtsBase*comboMult(comboVal));
      setPoints(p=>p+inlinePts);
      setCleared(c=>c+s.count);
      const id=Date.now()+Math.random();
      setPopups(p=>[...p,{id,x:s.popX,y:s.popY,pts:inlinePts,
        combo:comboVal>=2?comboVal:0, small:true}]);
      setTimeout(()=>setPopups(p=>p.filter(x=>x.id!==id)),1200);
      setTimeout(()=>{
        setBoard(s.after);
        setGlowing(p=>{const n=new Set(p);n.delete(gk);return n;});
        setTimeout(next,30);
      },200);
    }
  };

  function checkGameOver(boardState,cmState){
    const hasEmpty=[...cmState.entries()].some(([k,cell])=>{
      if(cell.state!=='unlocked')return false;
      const[r,c]=k.split(',').map(Number);
      return boardState[r][c].length===0;
    });
    if(!hasEmpty)setGameOver(true);
  }

  function applyLastTransferred(steps){
    const s=new Set();
    steps.forEach(st=>{if(st.type==='transfer')s.add(`${st.to[0]},${st.to[1]}`);});
    setLastTransferred(s);
  }

  // ── Place a stack ─────────────────────────────────────────────────────────
  function triggerPlace(stackIdx,row,col){
    const{board:b,incoming:inc,isAnimating:anim,cellMap:cm,
          points:pts,cleared:clr,history:hist,moveCount:mc,combo:cmb}=live.current;
    if(anim||gameOver)return;
    const info=cm.get(`${row},${col}`);
    if(!info||info.state!=='unlocked'||b[row][col].length>0)return;

    const newMc=mc+1;
    setHistory([...hist,snap(b,inc,cm,pts,clr,mc,cmb)].slice(-5));

    const{steps,finalBoard,totalCleared:nc,transferCount,emptiedCount}=
      computeSteps(b,row,col,inc[stackIdx]);

    applyLastTransferred(steps);

    const newProg=getProgression(newMc);
    const ni=[...inc]; ni[stackIdx]=rndStack(newProg); setIncoming(ni);
    setMoveCount(newMc);

    const newCombo=nc>0?cmb+1:0;
    setCombo(newCombo);

    // Bonus at end: transfer bonus OR empty-stack multiplier
    const tBonus=transferBonus(transferCount);
    const eMult=emptyMult(emptiedCount);
    // If stacks were emptied: bonus = total_clear_base * (mult-1) as extra
    // Otherwise: flat transfer bonus
    const[px,py]=cellXY(col,row);
    let bonusInfo=null;
    if(nc>0){
      if(emptiedCount>0){
        // Multiplier: extra on top of per-clear inline popups
        const totalBase=steps.filter(s=>s.type==='clear')
          .reduce((sum,s)=>sum+Math.round(s.clearPtsBase*comboMult(newCombo)),0);
        const extra=Math.round(totalBase*(eMult-1));
        if(extra>0) bonusInfo={x:px,y:py-30,pts:extra,
          label:`×${eMult}`,type:'mult'};
      } else if(tBonus>0){
        bonusInfo={x:px,y:py-30,pts:tBonus,
          label:`+${tBonus} bonus`,type:'transfer'};
      }
      if(bonusInfo) setTimeout(()=>{
        setPoints(p=>p+bonusInfo.pts);
      },steps.length*(120+20)+300);
    } else if(tBonus>0){
      // Transfer bonus even without clear
      bonusInfo={x:px,y:py-30,pts:tBonus,label:`+${tBonus} bonus`,type:'transfer'};
      setTimeout(()=>setPoints(p=>p+tBonus),steps.length*(120+20)+100);
    }

    if(!steps.length){
      setBoard(finalBoard);
      // no clears, just apply transfer bonus immediately
      if(tBonus>0){
        setPoints(p=>p+tBonus);
        const id=Date.now()+Math.random();
        setPopups(p=>[...p,{id,x:px,y:py,pts:tBonus,label:`+${tBonus} bonus`,type:'transfer'}]);
        setTimeout(()=>setPopups(p=>p.filter(x=>x.id!==id)),1400);
      }
      checkGameOver(finalBoard,cm);
      return;
    }
    setBoard(steps[0].before);setIsAnim(true);
    playRef.current(steps,0,finalBoard,cm,newCombo,bonusInfo);
  }

  // ── Undo ──────────────────────────────────────────────────────────────────
  function undo(){
    const{history:hist,isAnimating:anim,points:pts}=live.current;
    if(!hist.length||anim||pts<UNDO_COST)return;
    const prev=hist[hist.length-1];
    setBoard(prev.board);setIncoming(prev.incoming);setCellMap(prev.cellMap);
    setPoints(prev.points-UNDO_COST);setCleared(prev.cleared);
    setMoveCount(prev.moveCount);setCombo(prev.combo??0);
    setHistory(hist.slice(0,-1));
    setGameOver(false);setFlyHex(null);setGlowing(new Set());setPopups([]);
  }

  // ── Callbacks ─────────────────────────────────────────────────────────────
  cbRef.current={
    dragMove(cx,cy){ setDragPos({x:cx,y:cy}); setDropHL(clientToEmptyCell(cx,cy)); },
    dragEnd(cx,cy){
      const{dragging:d,isAnimating:a}=live.current;
      setDragging(null);setDropHL(null);
      if(!d||a)return;
      const cell=clientToEmptyCell(cx,cy);
      if(cell)triggerPlace(d.idx,cell[0],cell[1]);
    },
    panMove(cx,cy){
      if(!panStart.current)return;
      const{cx:sx,cy:sy,ox,oy}=panStart.current;
      setPanOffset({x:ox+(cx-sx),y:oy+(cy-sy)});
    },
    panEnd(cx,cy){
      if(clickStart.current&&!live.current.dragging){
        const{x,y}=clickStart.current;
        if(Math.hypot(cx-x,cy-y)<8&&!live.current.isAnimating){
          const hit=clientToCellAny(cx,cy);
          if(hit){
            // Tool click takes priority over unlock
            if(activeTool&&handleToolClick(hit.row,hit.col)){/* handled */}
            else if(hit.cell.state==='locked') tryUnlock(hit.key,hit.cell);
          }
        }
      }
      clickStart.current=null;
      setPanning(false);panStart.current=null;
    },
  };

  // ── Mouse ─────────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!dragging&&!panning)return;
    const mv=e=>{
      if(live.current.dragging)cbRef.current.dragMove(e.clientX,e.clientY);
      else if(live.current.panning)cbRef.current.panMove(e.clientX,e.clientY);
    };
    const up=e=>{
      if(live.current.dragging)cbRef.current.dragEnd(e.clientX,e.clientY);
      else cbRef.current.panEnd(e.clientX,e.clientY);
    };
    window.addEventListener("mousemove",mv);window.addEventListener("mouseup",up);
    return()=>{window.removeEventListener("mousemove",mv);window.removeEventListener("mouseup",up);};
  },[dragging,panning]);

  // ── Touch: cards ──────────────────────────────────────────────────────────
  useEffect(()=>{
    const cls=[0,1,2].map(i=>{
      const el=cardRefs.current[i]; if(!el)return()=>{};
      const ts=e=>{if(live.current.isAnimating||live.current.gameOver)return;e.preventDefault();e.stopPropagation();handleCheatTap(i);setActiveTool(null);setSwapFirst(null);const t=e.touches[0];setDragging({idx:i});setDragPos({x:t.clientX,y:t.clientY});};
      const tm=e=>{e.preventDefault();const t=e.touches[0];cbRef.current.dragMove(t.clientX,t.clientY);};
      const te=e=>{e.preventDefault();const t=e.changedTouches[0];cbRef.current.dragEnd(t.clientX,t.clientY);};
      el.addEventListener("touchstart",ts,{passive:false});el.addEventListener("touchmove",tm,{passive:false});el.addEventListener("touchend",te,{passive:false});
      return()=>{el.removeEventListener("touchstart",ts);el.removeEventListener("touchmove",tm);el.removeEventListener("touchend",te);};
    });
    return()=>cls.forEach(fn=>fn());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── Touch: board ──────────────────────────────────────────────────────────
  useEffect(()=>{
    const el=boardSvgRef.current; if(!el)return;
    const ts=e=>{
      if(live.current.isAnimating||live.current.dragging)return;
      e.preventDefault();
      const t=e.touches[0],{panOffset:{x:ox,y:oy}}=live.current;
      clickStart.current={x:t.clientX,y:t.clientY};
      setPanning(true);panStart.current={cx:t.clientX,cy:t.clientY,ox,oy};
    };
    const tm=e=>{if(!live.current.panning)return;e.preventDefault();const t=e.touches[0];cbRef.current.panMove(t.clientX,t.clientY);};
    const te=e=>{const t=e.changedTouches[0];cbRef.current.panEnd(t.clientX,t.clientY);};
    el.addEventListener("touchstart",ts,{passive:false});el.addEventListener("touchmove",tm,{passive:false});el.addEventListener("touchend",te,{passive:false});
    return()=>{el.removeEventListener("touchstart",ts);el.removeEventListener("touchmove",tm);el.removeEventListener("touchend",te);};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const dragActive   =!!dragging&&!isAnimating&&!gameOver;
  const draggedStack =dragActive?incoming[dragging.idx]:null;
  const selTop       =draggedStack?topOf(draggedStack):null;
  const donors=new Set(selTop!==null&&dropHL
    ?getNeighbors(dropHL[0],dropHL[1]).filter(([r,c])=>{
        const info=cellMap.get(`${r},${c}`);
        return info?.state==='unlocked'&&topOf(board[r][c])===selTop;
      }).map(([r,c])=>`${r}-${c}`)
    :[]);

  const cheapestLocked=useMemo(()=>{
    let min=Infinity;
    cellMap.forEach(c=>{if(c.state==='locked'&&c.cost<min)min=c.cost;});
    return min===Infinity?null:min;
  },[cellMap]);

  const canUndo=history.length>0&&!isAnimating&&points>=UNDO_COST;
  const prog=getProgression(moveCount);

  // ── Action tools ──────────────────────────────────────────────────────────
  const ACTIONS={
    swap:  {base:100, label:"⇄ Swap",   get cost(){ return 100+actionUsages.swap*50; }},
    bubble:{base:80,  label:"↓ Bubble", get cost(){ return 80 +actionUsages.bubble*50; }},
    trim:  {base:150, label:"✂ Trim",   get cost(){ return 150+actionUsages.trim*50; }},
  };

  function canUseTool(name){ return !isAnimating&&!gameOver&&!dragging&&points>=ACTIONS[name].cost; }

  function selectTool(name){
    if(activeTool===name){ setActiveTool(null);setSwapFirst(null);return; }
    setActiveTool(name);setSwapFirst(null);
  }

  // Shared: deduct action cost, save undo, run BFS cascade from affected cells, animate
  function runActionCascade(nb, startCells, actionCost, toolName){
    const{points:pts,cleared:clr,moveCount:mc,combo:cmb,cellMap:cm}=live.current;
    setHistory(h=>[...h,snap(board,incoming,cm,pts,clr,mc,cmb)].slice(-5));
    setPoints(p=>p-actionCost);
    setActiveTool(null);setSwapFirst(null);
    if(toolName&&actionUsages[toolName]!=null)
      setActionUsages(u=>({...u,[toolName]:u[toolName]+1}));

    let currentBoard=nb;
    let allSteps=[];
    let totalCleared=0,transferCount=0,emptiedCount=0;
    for(const[row,col] of startCells){
      if(currentBoard[row][col].length===0) continue;
      const{steps,finalBoard,totalCleared:nc,transferCount:tc,emptiedCount:ec}=
        computeSteps(currentBoard,row,col,[]);
      const offset=allSteps.length;
      allSteps=[...allSteps,...steps.map(s=>({...s,_k:(s._k??0)+offset}))];
      currentBoard=finalBoard;
      totalCleared+=nc; transferCount+=tc; emptiedCount+=ec;
    }
    const finalBoard=currentBoard;
    applyLastTransferred(allSteps);
    const newCombo=totalCleared>0?cmb+1:0;
    setCombo(newCombo);

    const tBonus=transferBonus(transferCount);
    const eMult=emptyMult(emptiedCount);
    const[px,py]=cellXY(startCells[0][1],startCells[0][0]);
    let bonusInfo=null;
    if(totalCleared>0){
      if(emptiedCount>0){
        const totalBase=allSteps.filter(s=>s.type==='clear')
          .reduce((sum,s)=>sum+Math.round(s.clearPtsBase*comboMult(newCombo)),0);
        const extra=Math.round(totalBase*(eMult-1));
        if(extra>0){ bonusInfo={x:px,y:py-30,pts:extra,label:`×${eMult}`,type:'mult'};
          setTimeout(()=>setPoints(p=>p+extra),allSteps.length*(120+20)+300); }
      } else if(tBonus>0){
        bonusInfo={x:px,y:py-30,pts:tBonus,label:`+${tBonus} bonus`,type:'transfer'};
        setTimeout(()=>setPoints(p=>p+tBonus),allSteps.length*(120+20)+200);
      }
    } else if(tBonus>0){
      bonusInfo={x:px,y:py-30,pts:tBonus,label:`+${tBonus} bonus`,type:'transfer'};
      setTimeout(()=>setPoints(p=>p+tBonus),allSteps.length*(120+20)+100);
    }

    if(!allSteps.length){
      setBoard(finalBoard);
      if(tBonus>0&&totalCleared===0){
        setPoints(p=>p+tBonus);
        const id=Date.now()+Math.random();
        setPopups(p=>[...p,{id,x:px,y:py,pts:tBonus,label:`+${tBonus} bonus`,type:'transfer'}]);
        setTimeout(()=>setPopups(p=>p.filter(x=>x.id!==id)),1400);
      }
      checkGameOver(finalBoard,cm);
    }else{
      setBoard(allSteps[0].before);setIsAnim(true);
      playRef.current(allSteps,0,finalBoard,cm,newCombo,bonusInfo);
    }
  }

  function applyBubble(row,col){
    const stack=[...board[row][col]];
    if(stack.length<2) return;
    const topC=stack[stack.length-1];
    let topStart=stack.length-1;
    while(topStart>0&&stack[topStart-1]===topC) topStart--;
    if(topStart===0) return;
    const secC=stack[topStart-1];
    let secStart=topStart-1;
    while(secStart>0&&stack[secStart-1]===secC) secStart--;
    const topBlock=stack.splice(topStart,stack.length-topStart);
    const secBlock=stack.splice(secStart,topStart-secStart);
    const nb=cp(board); nb[row][col]=[...stack,...topBlock,...secBlock];
    runActionCascade(nb,[[row,col]],ACTIONS.bubble.cost,'bubble');
  }

  function applyTrim(row,col){
    const stack=[...board[row][col]];
    if(!stack.length) return;
    const topC=stack[stack.length-1];
    let i=stack.length-1;
    while(i>=0&&stack[i]===topC) i--;
    const nb=cp(board); nb[row][col]=stack.slice(0,i+1);
    runActionCascade(nb,[[row,col]],ACTIONS.trim.cost,'trim');
  }

  function applySwap(r1,c1,r2,c2){
    const nb=cp(board);
    [nb[r1][c1],nb[r2][c2]]=[nb[r2][c2],nb[r1][c1]];
    // Cascade from both swapped cells
    runActionCascade(nb,[[r1,c1],[r2,c2]],ACTIONS.swap.cost,'swap');
  }

  // Handle board cell click for tools (intercepts clientToCellAny logic)
  function handleToolClick(row,col){
    if(!activeTool) return false;
    const stack=board[row][col];
    const info=cellMap.get(`${row},${col}`);
    if(!info||info.state!=='unlocked') return true; // consume click
    if(activeTool==='bubble'&&stack.length>=2){ applyBubble(row,col); return true; }
    if(activeTool==='trim'&&stack.length>=1){ applyTrim(row,col); return true; }
    if(activeTool==='swap'){
      if(!swapFirst){ setSwapFirst([row,col]); return true; }
      const[r1,c1]=swapFirst;
      if(r1===row&&c1===col){ setSwapFirst(null); return true; } // deselect
      applySwap(r1,c1,row,col); return true;
    }
    return true;
  }

  // Cheat code: 1×pile0, 2×pile1, 3×pile2 ────────────────────────────────────
  const[cheatTaps,setCheatTaps]=useState([0,0,0]);
  const[cheatUnlocked,setCheatUnlocked]=useState(false);
  function handleCheatTap(i){
    setCheatTaps(prev=>{
      const next=[...prev];
      next[i]++;
      if(next[0]>=1&&next[1]>=2&&next[2]>=3){
        if(next[0]===1&&next[1]===2&&next[2]===3){ setCheatUnlocked(true); return[0,0,0]; }
        return[0,0,0];
      }
      if(i===0&&next[1]>0) return[1,0,0];
      if(i===1&&next[0]<1) return[0,0,0];
      if(i===2&&next[1]<2) return[0,0,0];
      return next;
    });
  }

  function reset(){
    const p=getProgression(0);
    setBoard(initBoard());setIncoming([rndStack(p),rndStack(p),rndStack(p)]);
    setCellMap(initCellMap());setPoints(0);setCleared(0);setMoveCount(0);setCombo(0);
    setPopups([]);setGlowing(new Set());setNewUnlocks(new Set());
    setDragging(null);setDropHL(null);setFlyHex(null);setIsAnim(false);
    setPanning(false);setPanOffset(INIT_PAN);setHistory([]);setGameOver(false);
    setCantAfford(null);setNewColorBanner(null);setActionUsages({swap:0,bubble:0,trim:0});
    panStart.current=null;clickStart.current=null;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",minHeight:"100vh",
      background:"linear-gradient(160deg,#c5e5f8 0%,#d8eef8 50%,#b5d5ec 100%)",
      color:"#1a4060",fontFamily:"system-ui,sans-serif",paddingBottom:16,userSelect:"none"}}>

      {/* Header */}
      <div style={{textAlign:"center",padding:"10px 0 2px",zIndex:20,position:"relative"}}>
        <h1 style={{margin:0,fontSize:24,fontWeight:900,letterSpacing:3,
          color:"#1a6090",textShadow:"0 2px 8px rgba(100,180,255,0.3)"}}>HEX STACK</h1>
      </div>

      {/* Stats */}
      <div style={{display:"flex",gap:16,marginBottom:2,fontSize:11,fontWeight:600,zIndex:20,position:"relative",flexWrap:"wrap",justifyContent:"center"}}>
        <span style={{color:"#1a6090"}}>
          POINTS <span style={{color:"#e07010",fontSize:20,fontWeight:900}}>{points.toLocaleString()}</span>
        </span>
        <span style={{color:"#9bbcd4"}}>|</span>
        <span style={{color:"#1a6090"}}>
          EFFACÉ <span style={{color:"#208040",fontSize:18,fontWeight:900}}>{cleared}</span>
        </span>
        {combo>=2&&(
          <span style={{color:combo>=3?"#e03050":"#e07010",fontWeight:900,fontSize:13,
            textShadow:combo>=3?"0 0 8px rgba(224,48,80,0.5)":"none"}}>
            ×{comboMult(combo).toFixed(1).replace('.0','')} COMBO !
          </span>
        )}
      </div>

      {/* Unlock hint */}
      {cheapestLocked!==null&&!gameOver&&(
        <div style={{fontSize:10,marginBottom:2,zIndex:20,position:"relative",
          color:points>=cheapestLocked?"#208040":"#7aaac8"}}>
          {points>=cheapestLocked
            ?"✓ Tape une case verrouillée pour la débloquer"
            :`Prochaine case : ${cheapestLocked.toLocaleString()} pts`}
        </div>
      )}

      {/* New color banner */}
      {newColorBanner&&(
        <div style={{position:"fixed",top:60,left:"50%",transform:"translateX(-50%)",
          background:"rgba(30,60,100,0.9)",color:"white",padding:"8px 22px",
          borderRadius:20,fontSize:14,fontWeight:700,zIndex:100,
          boxShadow:"0 4px 20px rgba(0,0,0,0.3)",
          animation:"bannerPop 0.4s ease-out",
          letterSpacing:1}}>
          🎨 Nouvelle couleur : {newColorBanner} !
        </div>
      )}

      {/* Board */}
      <div style={{width:VIEWPORT_W,height:VIEWPORT_H,overflow:"hidden",borderRadius:16,
        boxShadow:"0 4px 24px rgba(60,120,180,0.15)",position:"relative",flexShrink:0}}>
        <svg ref={boardSvgRef} width={VIEWPORT_W} height={VIEWPORT_H}
          style={{display:"block",touchAction:"none",
            cursor:panning?"grabbing":dragActive?"crosshair":"grab"}}
          onMouseDown={e=>{
            if(live.current.isAnimating||live.current.dragging)return;
            const{panOffset:{x:ox,y:oy}}=live.current;
            clickStart.current={x:e.clientX,y:e.clientY};
            setPanning(true);panStart.current={cx:e.clientX,cy:e.clientY,ox,oy};
          }}>
          <defs>
            <style>{`
              @keyframes clrPulse{0%,100%{opacity:1}45%{opacity:0.1}}
              @keyframes unlockPop{0%{transform:scale(0.6);opacity:0}65%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
              @keyframes popFloat{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-40px)}}
              @keyframes cantAfford{0%,100%{transform:translateX(0)}25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}
              @keyframes bannerPop{0%{opacity:0;transform:translateX(-50%) translateY(-12px)}100%{opacity:1;transform:translateX(-50%) translateY(0)}}
              @keyframes toolPulse{0%,100%{opacity:0.5}50%{opacity:1}}
            `}</style>
            {/* Drop shadow for whole stacks */}
            <filter id="stackShadow" x="-25%" y="-10%" width="150%" height="140%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="6" result="b"/>
              <feOffset dx="0" dy="10" result="o"/>
              <feFlood floodColor="#1020a0" floodOpacity="0.18" result="c"/>
              <feComposite in="c" in2="o" operator="in" result="s"/>
              <feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            {/* Floor cell highlight */}
            <radialGradient id="floorHL" cx="25%" cy="20%" r="55%" gradientUnits="objectBoundingBox">
              <stop offset="0%"   stopColor="white" stopOpacity="0.45"/>
              <stop offset="60%"  stopColor="white" stopOpacity="0.08"/>
              <stop offset="100%" stopColor="white" stopOpacity="0"/>
            </radialGradient>
            {/* Per-color gradients */}
            {COLORS.map(col=>(
              <g key={col.id}>
                <linearGradient id={`hxT${col.id}`} x1="0.05" y1="0" x2="0.95" y2="1" gradientUnits="objectBoundingBox">
                  <stop offset="0%"   stopColor={col.top}/>
                  <stop offset="100%" stopColor={col.topDark}/>
                </linearGradient>
                <radialGradient id={`hxHL${col.id}`} cx="22%" cy="18%" r="55%" gradientUnits="objectBoundingBox">
                  <stop offset="0%"   stopColor="white" stopOpacity="0.22"/>
                  <stop offset="55%"  stopColor="white" stopOpacity="0.04"/>
                  <stop offset="100%" stopColor="white" stopOpacity="0"/>
                </radialGradient>
              </g>
            ))}
          </defs>

          <g transform={`translate(${panOffset.x},${panOffset.y})`}>
            {cellsByY.map(({row,col,key})=>{
              const[cx,cy]=cellXY(col,row);
              const info=cellMap.get(key);
              const locked=info?.state!=='unlocked';
              const stack=locked?[]:board[row][col];
              const isDonor=donors.has(`${row}-${col}`);
              const isHL=!locked&&dropHL&&dropHL[0]===row&&dropHL[1]===col;
              const isGlow=glowing.has(`${row}-${col}`);
              const justUnlocked=newUnlocks.has(key);
              const shaking=cantAffordKey===key;
              const isReady=readyCells.has(key);
              const canAfford=locked&&!info?.autoUnlock&&isReady&&points>=(info?.cost??0);
              const isSwapFirst=swapFirst&&swapFirst[0]===row&&swapFirst[1]===col;
              const isToolTarget=activeTool&&!locked&&(
                (activeTool==='bubble'&&stack.length>=2)||
                (activeTool==='trim'&&stack.length>=1)||
                (activeTool==='swap'&&stack.length>=0)
              );
              return (
                <g key={key}
                  style={justUnlocked?{animation:"unlockPop 0.5s ease-out"}
                    :shaking?{animation:"cantAfford 0.35s ease-in-out"}:undefined}>
                  <FloorHex cx={cx} cy={cy} locked={locked} cost={info?.cost??0}
                    autoUnlock={info?.autoUnlock??null}
                    preStack={info?.preStack} canAfford={canAfford} isReady={isReady}
                    isHL={isHL} isDonor={isDonor} isGlow={isGlow}
                    isToolTarget={isToolTarget} isSwapFirst={isSwapFirst}
                    dragActive={dragActive&&!locked&&stack.length===0} selTop={selTop}/>
                  {!locked&&stack.length>0&&<Stack3D stack={stack} cx={cx} cy={cy}/>}
                </g>
              );
            })}
            {popups.map(p=>(
              <g key={p.id} style={{pointerEvents:"none"}}>
                <text x={p.x} y={p.y-20} textAnchor="middle"
                  fill={p.type==='mult'?"#f1c40f"
                    :p.type==='transfer'?"#2ecc71"
                    :p.combo>=3?"#e03050"
                    :p.combo>=2?"#e07010":"#e07010"}
                  fontSize={p.type==='mult'||p.type==='transfer'?18:p.small?13:17}
                  fontWeight={900}
                  style={{animation:"popFloat 1.4s ease-out forwards",
                    filter:"drop-shadow(0 0 4px rgba(0,0,0,0.3))"}}>
                  {p.type==='mult'
                    ?`×${p.label?.replace('×','')} +${p.pts}!`
                    :p.type==='transfer'
                    ?`+${p.pts} transfert!`
                    :p.combo>=2
                    ?`+${p.pts} ×${comboMult(p.combo).toFixed(1).replace('.0','')}!`
                    :`+${p.pts}!`}
                </text>
              </g>
            ))}
          </g>
          {flyHex&&<FlyHex key={flyHex.key} {...flyHex} panX={panOffset.x} panY={panOffset.y}/>}
        </svg>

        {gameOver&&(
          <div style={{position:"absolute",inset:0,borderRadius:16,background:"rgba(10,30,60,0.78)",
            display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
            <div style={{fontSize:28,fontWeight:900,color:"white",letterSpacing:2,
              textShadow:"0 2px 16px rgba(100,180,255,0.5)"}}>PARTIE TERMINÉE</div>
            <div style={{fontSize:14,color:"#a0d0f0"}}>Plus aucune case vide disponible</div>
            <div style={{fontSize:22,fontWeight:900,color:"#f1c40f"}}>{points.toLocaleString()} pts</div>
            <div style={{fontSize:13,color:"#80b8d8"}}>{cleared} hexagones effacés · {moveCount} coups</div>
            <button onClick={reset}
              style={{marginTop:8,background:"rgba(255,255,255,0.15)",border:"2px solid rgba(255,255,255,0.4)",
                color:"white",borderRadius:12,padding:"8px 28px",cursor:"pointer",
                fontSize:14,letterSpacing:2,fontWeight:700,transition:"all 0.15s"}}
              onMouseEnter={e=>e.target.style.background="rgba(255,255,255,0.3)"}
              onMouseLeave={e=>e.target.style.background="rgba(255,255,255,0.15)"}>
              REJOUER
            </button>
          </div>
        )}
      </div>

      {/* Incoming */}
      {!gameOver&&(
        <div style={{marginTop:1}}>
          <svg width={VIEWPORT_W} height={INC_H} overflow="visible" style={{display:"block",touchAction:"none"}}>
            {incoming.map((stack,i)=>{
              const cx=INC_CX[i],cy=INC_CY,isDragged=dragging?.idx===i;
              return (
                <g key={i} ref={el=>{cardRefs.current[i]=el;}}
                  onMouseDown={e=>{
                    handleCheatTap(i);
                    if(live.current.isAnimating||gameOver)return;
                    e.preventDefault();e.stopPropagation();
                    setActiveTool(null);setSwapFirst(null);
                    setDragging({idx:i});setDragPos({x:e.clientX,y:e.clientY});
                  }}
                  style={{cursor:isAnimating||gameOver?"default":"grab",
                    opacity:isDragged?0.3:isAnimating?0.5:1,
                    transition:"opacity 0.15s",WebkitTouchCallout:"none",WebkitUserSelect:"none"}}>
                  <path d={sidePath(cx,cy,R-2,SIDE_D)} fill={isDragged?"#9cc4e4":"#b8d4ea"}/>
                  <path d={rhp(cx,cy,R-2)} fill={isDragged?"#e4f2ff":"#ddeef8"}
                    stroke={isDragged?"#f1c40f":"rgba(155,195,225,0.7)"} strokeWidth={isDragged?2:0.7}/>
                  {stack.length>0&&<Stack3D stack={stack} cx={cx} cy={cy}/>}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Action tools + controls */}
      <div style={{marginTop:6,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>

        {/* Tool buttons row */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center"}}>
          {Object.entries(ACTIONS).map(([name,{cost,label}])=>{
            const active=activeTool===name;
            const able=canUseTool(name);
            return(
              <button key={name} onClick={()=>{if(able||active)selectTool(name);}}
                style={{
                  background:active?"rgba(240,180,0,0.2)":able?"rgba(255,255,255,0.6)":"rgba(255,255,255,0.2)",
                  border:`1.5px solid ${active?"#e8a000":able?"rgba(120,180,220,0.5)":"rgba(120,180,220,0.2)"}`,
                  color:active?"#8a5800":able?"#4a90b8":"rgba(74,144,184,0.35)",
                  borderRadius:10,padding:"5px 12px",cursor:able||active?"pointer":"default",
                  fontSize:11,fontWeight:700,transition:"all 0.15s",
                  boxShadow:active?"0 0 12px rgba(240,180,0,0.3)":"none",
                }}>
                {label} <span style={{opacity:0.7,fontSize:10}}>{cost}pts</span>
              </button>
            );
          })}
        </div>

        {/* Active tool hint */}
        {activeTool&&(
          <div style={{fontSize:10,color:"#e8a000",fontWeight:600,letterSpacing:0.5}}>
            {activeTool==='swap'&&!swapFirst&&"Clique une première pile"}
            {activeTool==='swap'&&swapFirst&&"Clique la deuxième pile"}
            {activeTool==='bubble'&&"Clique une pile à inverser"}
            {activeTool==='trim'&&"Clique une pile pour rogner le haut"}
            {" · "}<span style={{cursor:"pointer",textDecoration:"underline"}}
              onClick={()=>{setActiveTool(null);setSwapFirst(null);}}>annuler</span>
          </div>
        )}

        {/* Undo + Reset + Cheat */}
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",justifyContent:"center"}}>
          <button onClick={undo} disabled={!canUndo}
            style={{background:canUndo?"rgba(255,255,255,0.6)":"rgba(255,255,255,0.25)",
              border:"1px solid rgba(120,180,220,0.5)",
              color:canUndo?"#4a90b8":"rgba(74,144,184,0.4)",borderRadius:10,
              padding:"5px 14px",cursor:canUndo?"pointer":"default",
              fontSize:11,letterSpacing:1,fontWeight:700,transition:"all 0.15s"}}
            onMouseEnter={e=>{if(canUndo){e.target.style.background="white";e.target.style.color="#1a6090";}}}
            onMouseLeave={e=>{if(canUndo){e.target.style.background="rgba(255,255,255,0.6)";e.target.style.color="#4a90b8";}}}>
            ↩ {UNDO_COST}pts
          </button>
          <button onClick={reset}
            style={{background:"rgba(255,255,255,0.6)",border:"1px solid rgba(120,180,220,0.5)",
              color:"#4a90b8",borderRadius:10,padding:"5px 14px",cursor:"pointer",
              fontSize:11,letterSpacing:2,fontWeight:700,transition:"all 0.15s"}}
            onMouseEnter={e=>{e.target.style.background="white";e.target.style.color="#1a6090";}}
            onMouseLeave={e=>{e.target.style.background="rgba(255,255,255,0.6)";e.target.style.color="#4a90b8";}}>
            RESET
          </button>
          {cheatUnlocked&&(
            <button onClick={()=>setPoints(p=>p+100)}
              style={{background:"rgba(255,220,50,0.25)",border:"1px solid rgba(200,160,0,0.5)",
                color:"#9a7000",borderRadius:10,padding:"5px 14px",cursor:"pointer",
                fontSize:11,letterSpacing:1,fontWeight:700,transition:"all 0.15s"}}
              onMouseEnter={e=>{e.target.style.background="rgba(255,220,50,0.5)";}}
              onMouseLeave={e=>{e.target.style.background="rgba(255,220,50,0.25)";}}>
              🐛 +100 pts
            </button>
          )}
        </div>
      </div>

      {/* Drag ghost */}
      {dragActive&&(
        <svg width={R*2+4} height={MAX_VIS*LAYER_H+R*2+SIDE_D+4} overflow="visible"
          style={{position:"fixed",left:dragPos.x-R,top:dragPos.y-R-MAX_VIS*LAYER_H/2,
            pointerEvents:"none",zIndex:9999,opacity:0.92,
            filter:"drop-shadow(0 6px 16px rgba(0,0,0,0.2))"}}>
          <Stack3D stack={incoming[dragging.idx]} cx={R+2} cy={R+MAX_VIS*LAYER_H}/>
        </svg>
      )}
    </div>
  );
}
