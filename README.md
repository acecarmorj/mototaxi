# mototaxi — esqueleto frontend (aprendizado)

Este repositório contém um front-end simples para um app de mototáxi (MVP) pensado para aprendizado. Não há backend por enquanto; os pedidos são salvos em localStorage para você testar no navegador e aprender fluxo de dados.

Como executar (Windows):
1. Instale Node.js LTS (https://nodejs.org).
2. Abra PowerShell na pasta deste repositório e rode:
   npm install
   npm run dev
3. O site abrirá em http://127.0.0.1:3000

O que há aqui:
- src/index.html — interface com duas abas: Passageiro e Piloto, com mapa Leaflet.
- src/styles.css — estilos simples.
- src/app.js — lógica que salva pedidos em localStorage, lista pedidos, permite piloto aceitar.
- setup.ps1 — script PowerShell para criar este projeto localmente (opcional).

Próximos passos sugeridos (tarefas de aprendizado):
- Entender app.js: abra no editor e leia os comentários.
- Modificar o formulário do passageiro (adicionar campo observações).
- Implementar um backend simples (Node + Express) para persistir pedidos em SQLite.
- Adicionar autenticação básica para pilotos (login simples).
- Aprender sobre fetch() para conectar frontend ao backend.
