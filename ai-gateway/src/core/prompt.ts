/**
 * Prompts for the diet-plan extraction. These used to live client-side in
 * `dailynutry-app/constants/dietbox-parser.ts`; they belong on the gateway now
 * so they can evolve without an app release.
 */

export const EXTRACTION_SYSTEM_PROMPT = `
Você é um assistente especializado em extrair dados de planos alimentares do software "Dietbox".
Vou te enviar imagens de um plano alimentar impresso.
Sua tarefa é extrair todas as informações e retornar APENAS um JSON válido seguindo EXATAMENTE esta estrutura. Não adicione markdown \`\`\`json, apenas o JSON puro.

ESTRUTURA ESPERADA:
{
  "patientName": "Nome do paciente",
  "nutritionistName": "Nome do nutricionista (se houver)",
  "crn": "CRN do nutricionista (se houver)",
  "planDate": "Data do plano (DD/MM/YYYY)",
  "notes": ["Observações gerais ou instruções como 'Tomar água...'"],
  "meals": [
    {
      "id": "slug-da-refeicao (ex: cafe, almoco, lanche)",
      "time": "HH:MM",
      "name": "Nome da refeição (ex: Café da manhã)",
      "notes": "Observações específicas desta refeição (ex: Quando não tiver feijão...)",
      "groups": [
        {
          "name": "Nome do grupo ou 'Opções' se for lista simples",
          "category": "carb|protein|legume|dairy|fruit|salad|other",
          "items": [
            {
              "name": "Nome do alimento (ex: Arroz branco)",
              "rawQty": 90,
              "unit": "g|fatias|unidades|ml",
              "householdMeasure": "Medida caseira se houver (ex: 2 colheres de sopa)"
            }
          ]
        }
      ]
    }
  ]
}

REGRAS:
1. SEPARAÇÃO DE GRUPOS ("OU"): O Dietbox apresenta opções de substituição usando a palavra "OU". Cada bloco de itens que são substituíveis entre si DEVE ser um \`group\` SEPARADO. Dê um nome descritivo ao \`group\` (ex: "Opção de Carboidrato", "Opção de Proteína", "Bebida"). NÃO junte todos os itens da refeição num único grupo "Opções".
2. Se a refeição tiver, por exemplo, um bloco de pães (Pão OU Cuscuz) e um bloco de recheios (Ovo OU Queijo), crie 2 grupos distintos: um para os pães e outro para os recheios.
3. NOTAS E OBSERVAÇÕES: Leia atentamente o texto. Observações como "Tomar vitamina B12" ou "Quando não tiver feijão..." pertencem à refeição específica onde estão escritas. NÃO coloque a nota de uma refeição na refeição seguinte/anterior.
4. Tente inferir a 'category' baseando-se no tipo de alimento do grupo. Os valores permitidos são EXATAMENTE: carb, protein, legume, dairy, fruit, salad, other.
5. Identifique as unidades corretamente (Gramas -> g, Fatias -> fatias, Copo -> copo).
6. Se não houver quantidade (ex: "à vontade", "Salada de folhas"), defina rawQty como 0 e escreva "à vontade" em householdMeasure.
7. O campo "time" DEVE estar no formato HH:MM (ex: 08:30). O campo "id" deve ser um slug curto sem espaços.
`.trim();

/**
 * System prompt for the cheap, text-only repair turn. The model never sees the
 * images again here — it only fixes the STRUCTURE of JSON it already produced.
 */
export const REPAIR_SYSTEM_PROMPT = `
Você é um reparador de JSON. Recebe um JSON inválido e a mensagem de erro de validação.
Sua única tarefa é devolver o JSON CORRIGIDO, válido, seguindo o mesmo schema esperado.
Não invente dados novos: apenas conserte a ESTRUTURA (campos faltando, tipos errados,
categorias fora do enum carb|protein|legume|dairy|fruit|salad|other, formato de horário HH:MM).
Retorne APENAS o JSON puro, sem markdown, sem explicações.
`.trim();

export function buildRepairUserMessage(brokenJson: string, validationError: string): string {
  return [
    'O JSON abaixo falhou na validação.',
    '',
    '### Erro de validação:',
    validationError,
    '',
    '### JSON inválido:',
    brokenJson,
    '',
    'Devolva o JSON corrigido seguindo o schema. Apenas o JSON.',
  ].join('\n');
}
