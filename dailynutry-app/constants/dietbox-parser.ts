import { DietPlan } from './foods';

const SYSTEM_PROMPT = `
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
4. Tente inferir a 'category' baseando-se no tipo de alimento do grupo.
5. Identifique as unidades corretamente (Gramas -> g, Fatias -> fatias, Copo -> copo).
6. Se não houver quantidade (ex: "à vontade", "Salada de folhas"), defina rawQty como 0 e escreva "à vontade" em householdMeasure.
`;

export async function parseDietboxImages(
  base64Images: string[],
  apiKey: string,
  onProgress?: (status: string) => void
): Promise<Partial<DietPlan>> {
  if (!apiKey) {
    throw new Error('API Key do Gemini é obrigatória.');
  }

  // Easter Eggs e mensagens de progresso
  const progressMessages = [
    "Extraindo textos e identificando alimentos...",
    "Categorizando opções e macronutrientes...",
    "Estruturando horários das refeições...",
    "Finalizando a montagem do plano...",
    "Pedindo ajuda pros Oompa-Loompas...",
    "O Sheldon descobriu uma falha que o Wollowitz não havia percebido... recalculando...",
    "It's a-me, Mario! Procurando o cogumelo da dieta...",
    "Que a Força (e a proteína) esteja com você...",
    "Jarvis, calcule os macros desta refeição...",
    "Consultando o oráculo de Matrix...",
    "Alocando pontos de XP em Vitalidade...",
    "Chamando os Vingadores da Nutrição...",
    "Ativando o modo Super Saiyajin da dieta...",
    "Calculando a rota de dobra espacial pras calorias...",
    "I'm Batman! E eu também faço dieta...",
    "A magia de Hogwarts não converte carboidrato, aguarde...",
    "Inserindo cheat code de vida infinita...",
    "Gotta catch 'em all! Capturando todos os nutrientes...",
    "Pela honra de Grayskull! Eu tenho a dieta!",
    "Bazinga! As calorias eram pegadinha...",
    "Lumos! Clareando os textos borrados...",
    "Carregando... não entre em pânico (e pegue sua toalha)...",
    "Isso é muito Black Mirror, né?",
    "Levantando o martelo do Thor (gasta muitas calorias)...",
    "Winter is coming... guardando os carboidratos...",
    "Fazendo o jutsu de invocação do plano perfeito...",
    "To infinity and beyond! Passando de 2000 kcal...",
    "O mestre Splinter aprovou esse cardápio...",
    "May the odds be ever in your favor (e que venha a hipertrofia)...",
    "Wait for it... legendary diet incoming!",
    "Você não passará! (Sem comer os vegetais)...",
    "Expecto Patronum! Espantando a gordura...",
    "Com grandes dietas vêm grandes responsabilidades...",
    "Houston, we have a diet plan...",
  ];

  let messageIndex = 0;
  let progressInterval: any;

  const startProgress = () => {
    progressInterval = setInterval(() => {
      if (onProgress && messageIndex < progressMessages.length) {
        onProgress(progressMessages[messageIndex]);
        messageIndex++;
      }
    }, 6000); // 6 segundos por mensagem
  };

  const parts = base64Images.map(img => ({
    inlineData: {
      data: img.replace(/^data:image\/\w+;base64,/, ''),
      mimeType: 'image/jpeg',
    }
  }));

  const payload = {
    contents: [
      {
        parts: [
          { text: SYSTEM_PROMPT },
          ...parts
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    }
  };

  // 1. Descobrir qual modelo 'flash' está disponível na conta do usuário
  onProgress?.('Buscando modelo inteligente na sua conta...');
  const modelsRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  const modelsData = await modelsRes.json();
  
  if (!modelsRes.ok) {
    throw new Error(`Erro ao listar modelos: ${modelsData.error?.message || modelsRes.status}`);
  }

  const availableModels = modelsData.models || [];
  const flashModels = availableModels.filter((m: any) => 
    m.name.includes('flash') && 
    m.supportedGenerationMethods?.includes('generateContent')
  );

  if (flashModels.length === 0) {
    throw new Error('Nenhum modelo Flash suportado foi encontrado na sua conta do Gemini.');
  }

  // Tenta pegar o 2.5-flash se existir, se não, pega o primeiro da lista
  const selectedModelName = flashModels.find((m: any) => m.name.includes('2.5-flash'))?.name || flashModels[0].name;

  // 2. Chamar a API com o modelo dinâmico
  onProgress?.('Enviando imagens para a IA (isso pode demorar até 1 minuto)...');
  startProgress();
  
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${selectedModelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API do Gemini: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!textResponse) {
      throw new Error('Resposta vazia da API do Gemini.');
    }

    onProgress?.('Analisando plano e criando estrutura...');
    
    try {
      return JSON.parse(textResponse) as Partial<DietPlan>;
    } catch (parseErr) {
      throw new Error('Erro ao parsear JSON retornado pelo Gemini.');
    }
  } finally {
    clearInterval(progressInterval);
  }
}
