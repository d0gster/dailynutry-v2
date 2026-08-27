# DailyNutry

App de nutrição que transforma a **foto de um plano alimentar impresso** (do
software Dietbox) em um plano interativo — com substituições, modo cozinha e
cálculo cru→pronto. O núcleo é OCR + IA: extrair JSON estruturado e confiável de
uma imagem.

Monorepo com duas partes:

| Pasta | O quê | Stack |
|---|---|---|
| [`dailynutry-app/`](dailynutry-app) | App mobile | Expo / React Native + TypeScript |
| [`ai-gateway/`](ai-gateway) | Gateway de IA | Node.js + TypeScript · Next.js · Postgres · Redis |

---

## Histórico de engenharia

**v1.** O app chamava o Gemini direto do celular, com a API key do próprio
usuário, e fazia `JSON.parse` cru na resposta. Rápido, mas a key ficava exposta
no client, não havia validação do output, nem fallback, nem visibilidade de
custo.

**v2.** A orquestração de IA foi movida para o `ai-gateway/`, um serviço Node/TS
que esconde as chaves, abstrai providers (Gemini, OpenAI, Anthropic) atrás de
uma interface única, faz fallback quando o primário falha, valida o output
(Zod + loop de reparo) e mede custo/latência por request.

O caminho Gemini-direto **não existe mais como fallback** — foi removido, não
desativado. Manter um atalho que chama a API do provider a partir do celular
preservaria exatamente a exposição de key que motivou a v2, e um fallback assim
é acionado justamente quando algo já deu errado, que é o pior momento para
degradar para o modo menos seguro. Hoje o app fala só com o gateway.

---

## Arquitetura do gateway

```mermaid
flowchart TD
  App[App React Native] -->|"POST /api/extract<br/>x-api-key + Bearer do dispositivo"| Auth

  subgraph GW[ai-gateway · Next.js route handler]
    Auth["Auth: chave do app + token do dispositivo<br/>consome 1 de quota"] --> RL[Rate-limit por chamador]
    RL --> Valid{"Os bytes são mesmo<br/>uma imagem?"}
    Valid -->|não| Refuse["422 · devolve a quota<br/>audit: image_invalid"]
    Valid -->|sim| Strip[Remove EXIF]
    Strip --> Cache{"Cache<br/>hash da imagem limpa"}
    Cache -->|miss| Router[Router + Fallback]
    Cache -->|hit| Enrich

    Guard{"Guardrail<br/>passa no Zod?"} -->|sim| SetCache["Grava no cache<br/>plano AINDA NÃO enriquecido"]
    Rejected["422 · NÃO tenta o próximo provider<br/>audit: content_rejected"]
    SetCache --> Enrich["Enriquecimento<br/>TACO + rendimento DESTE dispositivo"]
    Enrich --> Cost[Custo + tokens]
    Cost --> Log[("Postgres<br/>request_log + audit_event")]
    Cost --> Done[Resposta]
  end

  Router ==>|"① extração · com as imagens"| LLM
  LLM["Gemini → OpenAI → Anthropic<br/>fallback só em falha transitória"] ==> Guard
  Guard -.->|"② reparo · text-only, até N vezes"| LLM
  LLM -->|"recusa por conteúdo"| Rejected

  Cache <--> Redis[("Redis")]
```

**Duas idas à LLM, não uma.** A seta ① leva as imagens para a extração; a ②
é o loop de reparo do guardrail, uma chamada *text-only* que devolve o JSON
inválido e o erro de validação ao mesmo provider que respondeu, até
`MAX_REPAIR_ATTEMPTS`. O guardrail não recebe nada do router: ele julga a
**resposta do provider**, e é por isso que a seta volta.

**Recusa de conteúdo não é fallback.** Uma falha transitória (503, timeout)
desce a cadeia para o próximo provider. Uma recusa por política de conteúdo
para na hora — todo provider aplica política equivalente, então insistir só
distribuiria o mesmo material por todas as contas, pagando cada recusa.

**O cache guarda o plano antes do enriquecimento.** Enriquecer depende de quem
chama (cada dispositivo vê as próprias correções de rendimento), então cachear
o resultado enriquecido serviria os números de um usuário para o seguinte. O
caro é a extração; enriquecer de novo custa duas queries — por isso o caminho
de *hit* também passa pelo enriquecimento.

Por request: auth (chave do app + token do dispositivo + quota) → rate-limit →
validação da imagem (magic bytes, dimensões, EXIF) → cache por hash → router
com fallback → guardrail (Zod; em falha, reparo text-only) → enriquecimento
(TACO + rendimento) → custo (tokens × tabela de preço versionada) → persiste
log e auditoria, e responde.

**Por que Next.js (e não um serviço standalone):** bate a stack de Node/TS +
Postgres + Redis e coloca o dashboard de observabilidade no mesmo deploy.
Roda como Node server long-running (`runtime = 'nodejs'`), necessário pelo pool
do Postgres e cliente Redis.

### Onde cada coisa está

| Recurso | Arquivo |
|---|---|
| Abstração de providers | [`core/types.ts`](ai-gateway/src/core/types.ts) · [`providers/`](ai-gateway/src/providers) |
| Fallback entre providers | [`core/orchestrator.ts`](ai-gateway/src/core/orchestrator.ts) · [`core/config.ts`](ai-gateway/src/core/config.ts) |
| Validação + reparo do output | [`core/guardrail.ts`](ai-gateway/src/core/guardrail.ts) · [`core/schema.ts`](ai-gateway/src/core/schema.ts) |
| Custo / tokens | [`core/pricing.ts`](ai-gateway/src/core/pricing.ts) · [`core/cost.ts`](ai-gateway/src/core/cost.ts) |
| Cache + rate-limit | [`cache/redis.ts`](ai-gateway/src/cache/redis.ts) |
| Auth de dispositivo + quota | [`core/device-auth.ts`](ai-gateway/src/core/device-auth.ts) · [`db/device.ts`](ai-gateway/src/db/device.ts) |
| Validação de imagem + EXIF | [`core/image-validation.ts`](ai-gateway/src/core/image-validation.ts) |
| Política de conteúdo + bloqueio | [`core/content-policy.ts`](ai-gateway/src/core/content-policy.ts) · [`db/device-block.ts`](ai-gateway/src/db/device-block.ts) |
| Enriquecimento TACO / rendimento | [`core/enrichment.ts`](ai-gateway/src/core/enrichment.ts) · [`db/taco.ts`](ai-gateway/src/db/taco.ts) · [`db/yield.ts`](ai-gateway/src/db/yield.ts) |
| Observabilidade | [`db/request-log.ts`](ai-gateway/src/db/request-log.ts) · [`app/dashboard`](ai-gateway/src/app/dashboard) |
| Auditoria (suporte / investigação) | [`db/audit.ts`](ai-gateway/src/db/audit.ts) |
| Pipeline de supply-chain | [`scripts/supply-chain-check.mjs`](scripts/supply-chain-check.mjs) · [`SECURITY.md`](SECURITY.md) |

---

## Decisões e trade-offs

- **Adapters em `fetch` cru, sem SDK.** Mantém os adapters próximos do contrato
  REST de cada provider e sem dependências extras. OpenAI e Anthropic estão
  implementados mas ainda não validados contra key real (só há key do Gemini);
  ativam ao preencher o `.env`.
- **Reparo estrutural usa modelo de texto, não visão.** A chamada de visão roda
  uma vez. Quando o Zod reprova (enum inválido, campo faltando, JSON malformado),
  o reparo reenvia só o texto quebrado e o erro de validação. Corrige a forma do
  JSON, não a leitura da imagem.
- **Fallback distingue três casos, não dois.** Timeout/5xx/429 → próximo
  provider. 4xx → falha imediata, para não repetir um request inválido contra a
  quota de outro provider. **Recusa por conteúdo → para a cadeia inteira**: é um
  veredito sobre a imagem, não uma falha do provider, e todo provider aplica
  política equivalente. Insistir só distribuiria o mesmo material por todas as
  contas, pagando cada recusa — que era exatamente o comportamento antigo,
  quando um safety block vinha marcado como retryável.
- **Duas credenciais, com papéis diferentes.** A chave do app (`x-api-key`) diz
  "isto é o DailyNutry" — viaja dentro do binário, então é um portão fraco, não
  uma identidade. O token de dispositivo (`Bearer`) diz "isto é a instalação
  #1234": único por install, revogável, com quota diária. Rate-limit e quota
  penduram no token, então uma chave de app vazada não compra mais extração
  ilimitada.
- **Custo é estimativa.** Tabela de preço versionada (`PRICING_VERSION`). Modelo
  sem preço conhecido → custo `null`, em vez de um valor inventado.
- **Falha aberta e falha fechada são escolhas separadas.** Sem `DATABASE_URL`,
  os logs vão para stdout. Sem `REDIS_URL`, o cache vira no-op — perder cache
  custa dinheiro, não segurança. Mas o **rate-limit nunca** vira no-op: sem
  Redis ele cai num limitador em processo, e quando não consegue decidir, nega.
  Um limitador que se desliga sozinho ao perder a infra é exatamente o que um
  atacante provoca de propósito.

---

## Rodando

```bash
# Gateway
cd ai-gateway
cp .env.example .env            # preencha GEMINI_API_KEY e GATEWAY_API_KEY
npm install
docker compose up -d            # Postgres + Redis
npm run db:init                 # cria o schema e popula TACO + rendimentos
npm run dev                     # http://localhost:4000

# App
cd ../dailynutry-app
cp .env.example .env            # em dev, pode deixar a URL vazia
npm install
npm start
```

Postgres deixou de ser opcional: `device`, `yield_override`, `audit_event` e
`device_block` sustentam auth de dispositivo, quota e auditoria. Sem banco, o
registro de dispositivo responde 503 em vez de emitir um token que o gateway não
teria como verificar nem revogar depois.

A conexão do app é **configuração de build**, não de tela: `EXPO_PUBLIC_GATEWAY_URL`
e `EXPO_PUBLIC_GATEWAY_API_KEY` em [`dailynutry-app/.env`](dailynutry-app/.env.example).
Em desenvolvimento dá para deixar a URL vazia — o app deriva o IP da máquina
pelo Expo, então um celular no mesmo Wi-Fi conecta sem configurar nada. Em build
de produção a URL é obrigatória e precisa ser `https://`; sem ela o build falha,
em vez de apontar silenciosamente para `localhost`.

Nada disso é segredo: o Expo injeta todo `EXPO_PUBLIC_*` no bundle em tempo de
build, então esses valores viajam dentro do binário. Por isso a `x-api-key`
identifica o app, não um usuário — quem carrega a identidade é o token de
dispositivo, obtido sozinho na primeira chamada e guardado no keychain/keystore,
sem nada a configurar.

A tela **Configurações** cuida do que é preferência do usuário: escolha do
modelo e limpeza de dados.

Cada resposta traz, em `meta`: `attempts` (trace por provider), `fallbackReason`
quando um fallback respondeu, `repairs`, `cost` e `latencyMs`.

Sem nenhuma key de provider configurada, `/api/extract` responde **503** (`No LLM
provider configured`) — o gateway não devolve dado fabricado. O fallback entre
providers só ocorre, e só é demonstrável, com ≥2 keys reais; o comportamento do
router e dos guardrails é coberto pelos testes.

---

## Qualidade

```bash
git config core.hooksPath .githooks   # habilita o gate de pre-commit (uma vez)
```

O hook em [`.githooks/pre-commit`](.githooks/pre-commit) roda typecheck, lint e
testes apenas no(s) projeto(s) com mudanças staged, e **bloqueia o commit** se
algo falhar. Quando o `package.json`, o lockfile ou o `.npmrc` mudam, roda
também o `supply-chain` — só nesse caso, porque ele vai à rede.

- **Gateway:** `typecheck` · `lint` · `test` (83 unitários, tudo externo
  mockado) · `test:integration` (48 contra Postgres real).
- **App:** `typecheck` · `lint` · `test` (18).

**Por que duas suítes.** A unitária é hermética e roda sem Docker. A de
integração existe porque mock esconde exatamente a costura onde os dois bugs
reais moraram — um off-by-one de quota e uma direção invertida de busca, ambos
em SQL. O primeiro tinha teste unitário **verde afirmando o número errado**.

CI em [`.github/workflows/`](.github/workflows): `ci.yml` (ambos os projetos,
com Postgres em service container), `codeql.yml` (SAST) e
`dependency-review.yml`. A política de dependências está em
[`SECURITY.md`](SECURITY.md).

## Status

- ✅ Provider abstraction + fallback
- ✅ Guardrails (Zod + reparo)
- ✅ Custo + observabilidade (Postgres + dashboard)
- ✅ RAG TACO + normalização cru→pronto, com override por dispositivo
- ✅ Auth de dispositivo, quota diária, revogação e bloqueio temporário
- ✅ Validação de imagem, remoção de EXIF e política de conteúdo
- ✅ Auditoria e pipeline de supply-chain no CI
- ⏳ Adapters OpenAI/Anthropic implementados, ainda não validados contra key real
- ⏳ Ordem de páginas derivada do conteúdo; detecção de "não é plano alimentar"
