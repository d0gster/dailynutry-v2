#!/usr/bin/env node
// Verifica que todo nó do diagrama Mermaid do README é rotulado na PRIMEIRA
// vez que aparece.
//
// ---------------------------------------------------------------------------
// POR QUE ISTO EXISTE
//
// Mermaid deixa declarar um nó pelado numa linha e rotulá-lo em outra:
//
//     Cache -->|hit| Enrich                       <- primeira aparição, pelada
//     SetCache --> Enrich["Enriquecimento..."]    <- rótulo, mais adiante
//
// Renderizadores discordam sobre o que fazer nesse caso. O mermaid-cli aplica o
// rótulo posterior; o do GitHub mantém a primeira aparição e desenha a caixa
// escrita "Enrich". O diagrama do README foi publicado assim, com três nós
// mostrando o identificador cru, porque foi verificado localmente — no
// renderizador errado.
//
// Rotular na primeira aparição remove a ambiguidade em vez de torcer para que o
// renderizador escolha certo.
// ---------------------------------------------------------------------------
//
// Uso: node scripts/check-mermaid.mjs [arquivo.md]

import { readFileSync } from 'node:fs';

const file = process.argv[2] ?? 'README.md';
const md = readFileSync(file, 'utf8');

if (!md.includes('```mermaid')) {
  console.log(`${file}: nenhum diagrama Mermaid, nada a verificar.`);
  process.exit(0);
}

let failed = false;

// Um README pode ter mais de um diagrama; cada um tem escopo próprio.
md.split('```mermaid').slice(1).forEach((chunk, index) => {
  const src = chunk.split('```')[0];
  const rotulados = new Set();
  const pelados = [];

  for (const linhaBruta of src.split('\n')) {
    let linha = linhaBruta.trim();
    if (!linha || linha === 'end') continue;
    if (linha.startsWith('subgraph') || linha.startsWith('flowchart') || linha.startsWith('%%')) continue;

    // 1. Declarações COM rótulo: ID[...], ID{...}, ID(...), ID[(...)].
    //    Registra o id e remove a declaração inteira, para que as palavras de
    //    dentro do rótulo não sejam confundidas com identificadores.
    linha = linha.replace(
      /([A-Za-z_][A-Za-z0-9_]*)\s*(\[\(.*?\)\]|\[.*?\]|\{.*?\}|\(.*?\))/g,
      (_, id) => {
        rotulados.add(id);
        return ' ';
      },
    );

    // 2. Rótulos de aresta |...| não declaram nó.
    linha = linha.replace(/\|[^|]*\|/g, ' ');

    // 3. Setas.
    linha = linha.replace(/[-=.]+>|<[-=.]+|[-=.]{2,}/g, ' ');

    // O que sobrou são referências peladas.
    for (const m of linha.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
      if (!rotulados.has(m[0])) pelados.push(m[0]);
    }
  }

  const unicos = [...new Set(pelados)];
  const rotulo = `${file} · diagrama ${index + 1}`;

  if (unicos.length > 0) {
    failed = true;
    console.error(`✗ ${rotulo}: nós usados antes de receber rótulo — ${unicos.join(', ')}`);
    console.error('  O GitHub vai desenhar o identificador cru. Rotule-os na primeira aparição.');
  } else {
    console.log(`✓ ${rotulo}: ${rotulados.size} nós, todos rotulados na primeira aparição.`);
  }
});

process.exit(failed ? 1 : 0);
