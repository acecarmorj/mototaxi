# MotoJá

App de mototáxi para **Carmo, RJ** — PWA React com apps de **passageiro** e **mototaxista**, mapa real (Leaflet/OpenStreetMap) e backend MVP na Cloudflare (**Workers + D1**).

Marca do produto e URL pública: **MotoJá** → https://motoja.pages.dev

## Demo em produção

| Papel | URL |
|-------|-----|
| Passageiro | https://motoja.pages.dev/passageiro |
| Mototaxista | https://motoja.pages.dev/motorista |
| **Admin** (desktop) | https://motoja.pages.dev/admin |
| **API** | https://mototaxi-api.acecarmorj.workers.dev |

> `/` redireciona para `/passageiro` (sem hub de escolha).

> Link antigo `https://mototaxi.pages.dev` ainda pode coexistir (mesmo app). Prefira **motoja.pages.dev** em WhatsApp e materiais.

Documentação da Fase 1: [docs/FASE1-ESCOPO.md](docs/FASE1-ESCOPO.md)

## MVP backend (Workers + D1)

Corrida **real entre dispositivos** (não só `localStorage`):

1. Motorista fica **online** + ativa **GPS real** → posição no D1
2. Passageiro vê motoristas no mapa e **chama mototáxi**
3. Motorista recebe chamado, **aceita**, conclui
4. Passageiro acompanha status via polling

### Recursos Cloudflare

| Recurso | Nome | Binding |
|---------|------|---------|
| D1 | `mototaxi-db` | `DB` |
| Worker | `mototaxi-api` | — |
| Pages (oficial) | `motoja` | — |
| Pages (legado) | `mototaxi` | — |

Database ID: `8a89f2ae-f891-48d9-bef7-836e21dc8683`

### Endpoints

Base: `https://mototaxi-api.acecarmorj.workers.dev`

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Health check |
| POST | `/api/drivers` | Registra/atualiza motorista (`device_id`) |
| PATCH | `/api/drivers/:id/status` | Online/offline (+ lat/lng opcional) |
| PATCH | `/api/drivers/:id/location` | Atualiza GPS |
| GET | `/api/drivers/nearby?lat=&lng=` | Motoristas online próximos |
| POST | `/api/rides` | Passageiro solicita corrida |
| GET | `/api/rides/pending` | Corridas em busca |
| GET | `/api/rides/:id` | Status da corrida (+ motorista) |
| PATCH | `/api/rides/:id/accept` | Motorista aceita |
| PATCH | `/api/rides/:id/complete` | Conclui |
| PATCH | `/api/rides/:id/cancel` | Cancela |
| POST | `/api/passengers` | Cadastro/upsert passageiro (`name` + `phone` + `device_id`) |
| GET | `/api/passengers/me?device_id=` | Busca cadastro do passageiro |
| GET | `/api/admin/*` | Painel admin (header `X-Admin-Password`) |

CORS liberado para `https://motoja.pages.dev`, `https://mototaxi.pages.dev` e `localhost:5173` / `4173`.

### Painel admin (`/admin`)

- URL: https://motoja.pages.dev/admin (layout **desktop-first**: sidebar + tabelas)
- Autenticação: senha enviada no header `X-Admin-Password` (= secret `ADMIN_PASSWORD` no Worker)
- **Senha temporária de demo:** `123456` — **troque antes de uso real**
  - Definir/atualizar: `npx wrangler secret put ADMIN_PASSWORD --config worker/wrangler.toml`
  - Não versionar a senha em `wrangler.toml`
- Ações: listar passageiros / motoristas / corridas, buscar, cancelar corrida, bloquear motorista

Matching de corrida: **quem aceita primeiro** (sem ranking por proximidade neste MVP).

### Como testar em 2 dispositivos

1. Celular A → https://motoja.pages.dev/motorista  
   - Toque **ONLINE** (GPS começa a compartilhar)  
2. Celular B (ou outro navegador) → https://motoja.pages.dev/passageiro  
   - **Cadastre nome + telefone** (obrigatório na 1ª vez)  
   - Digite ou escolha o destino → **Chamar mototáxi**  
3. No A aparece o chamado (nome/telefone do passageiro)  
   - **Maps / Waze** até o passageiro (e depois até o destino)  
   - **Aceitar** (janela de **15s**) → mapa centraliza no passageiro  
4. No B a tela muda para a corrida aceita; no A **Concluir corrida**

### Limitações do MVP

- Sem auth OTP/JWT — só `device_id` no `localStorage` (passageiro/motorista)
- Admin com senha compartilhada simples (temporária)
- Sem WebSocket — polling a cada ~2–4s
- Sem pagamento ou documentos
- Matching = primeiro a aceitar (não o mais próximo)
- Nome/colete do motorista fixos no protótipo (`Zé Roberto` / `#032`)

## Pré-requisitos

- Node.js 18+
- npm
- Wrangler autenticado (`npx wrangler login`)

## Como rodar localmente

```powershell
cd D:\MOTOTAXI
npm install
npm run db:migrate:local   # schema D1 local
npm run api:dev            # Worker em http://127.0.0.1:8787
```

Em outro terminal, com a API apontando para o Worker local:

```powershell
$env:VITE_API_URL="http://127.0.0.1:8787"
npm run dev
```

Sem `VITE_API_URL`, o front usa a API de produção.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Front Vite (localhost:5173) |
| `npm run build` | Build de produção em `dist/` |
| `npm run deploy` | Build + deploy Pages |
| `npm run api:dev` | Worker local |
| `npm run api:deploy` | Deploy do Worker |
| `npm run db:migrate` | Aplica migrations no D1 remoto |
| `npm run db:migrate:local` | Aplica migrations no D1 local |

## Deploy

```powershell
npm run db:migrate
npm run api:deploy
npm run deploy
```

## Estrutura

```
MOTOTAXI/
├── docs/FASE1-ESCOPO.md
├── worker/
│   ├── wrangler.toml      # binding D1 + nome do Worker
│   ├── migrations/        # schema D1
│   └── src/index.js       # API
├── src/
│   ├── api.js             # cliente HTTP
│   ├── CarmotoApp.jsx
│   └── ...
└── package.json
```

## PWA / GPS

Há manifests em `/passageiro` e `/motorista` (e fallback genérico). HTTPS é necessário para geolocalização e instalação.

## Tecnologias

- React 18 + Vite + Tailwind + Leaflet
- Cloudflare Pages + Workers + D1
- vite-plugin-pwa
