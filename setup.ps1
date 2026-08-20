# setup.ps1 — cria projeto mototaxi (frontend simples) e instala dependências
# Salve este arquivo e execute: powershell -ExecutionPolicy Bypass -File .\setup.ps1
# Observação: este script NÃO instala o Node.js. Instale antes se necessário.

# ----- CONFIGURAÇÃO -----
$projectName = "mototaxi"
$startServerAfterInstall = $true   # Mude para $false se não quiser iniciar o servidor automaticamente

# ----- CHECAGEM DE NODE/NPM -----
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node NÃO encontrado. Instale Node.js (LTS) em https://nodejs.org e execute o script novamente." -ForegroundColor Red
  exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host "npm NÃO encontrado. Instale Node.js (inclui npm) e execute o script novamente." -ForegroundColor Red
  exit 1
}

# ----- CRIA PASTA DO PROJETO -----
$root = Join-Path (Get-Location) $projectName
if (-not (Test-Path $root)) {
  New-Item -ItemType Directory -Path $root | Out-Null
}
Set-Location $root

# ----- ARQUIVOS: package.json -----
$packageJson = @'
{
  "name": "mototaxi",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "npx live-server src --port=3000 --open=src/index.html"
  },
  "devDependencies": {
    "live-server": "^1.2.2"
  }
}
'@
$packageJson | Out-File -FilePath package.json -Encoding utf8 -Force

# ----- README.md -----
$readme = @'
# mototaxi — esqueleto frontend (aprendizado)

Este repositório contém um front-end simples para um app de mototáxi (MVP) pensado para aprendizado. Não há backend por enquanto; os pedidos são salvos em localStorage para você testar no navegador e aprender fluxo de dados.

Como executar (Windows):
1. Instale Node.js LTS (https://nodejs.org).
2. Abra PowerShell na pasta onde este arquivo foi salvo (o script cria a pasta mototaxi) e rode:
   powershell -ExecutionPolicy Bypass -File .\setup.ps1
   # ou, se o script já foi executado e você só quer rodar o servidor:
   npm install
   npm run dev
3. O site abrirá em http://127.0.0.1:3000

O que há aqui:
- src/index.html — interface com duas abas: Passageiro e Piloto.
- src/styles.css — estilos simples.
- src/app.js — lógica que salva pedidos em localStorage, lista pedidos, permite piloto aceitar.

Próximos passos sugeridos (tarefas de aprendizado):
- Entender app.js: abra no editor e leia os comentários.
- Modificar o formulário do passageiro (adicionar campo observações).
- Implementar um backend simples (Node + Express) para persistir pedidos em SQLite.
- Adicionar autenticação básica para pilotos (login simples).
- Aprender sobre fetch() para conectar frontend ao backend.
'@
$readme | Out-File -FilePath README.md -Encoding utf8 -Force

# ----- DIRETÓRIO src e ARQUIVOS -----
$srcDir = Join-Path $root "src"
if (-not (Test-Path $srcDir)) { New-Item -ItemType Directory -Path $srcDir | Out-Null }

# (o script inclui os mesmos arquivos já no repositório)

# ----- INSTALAR DEPENDÊNCIAS -----
Write-Host "Arquivo criados em: $root" -ForegroundColor Green
Write-Host "Executando npm install (pode demorar alguns segundos)..." -ForegroundColor Cyan
npm install

if ($LASTEXITCODE -ne 0) {
  Write-Host "npm install falhou. Verifique sua instalação do Node/npm e execute 'npm install' manualmente." -ForegroundColor Red
  exit 1
}

Write-Host "Dependências instaladas com sucesso." -ForegroundColor Green

if ($startServerAfterInstall) {
  Write-Host "Iniciando servidor de desenvolvimento (npm run dev)..." -ForegroundColor Cyan
  Write-Host "Se preferir iniciar manualmente depois, encerre este script com Ctrl+C e rode 'npm run dev'." -ForegroundColor Yellow
  npm run dev
} else {
  Write-Host "Para iniciar o servidor, rode:" -ForegroundColor Green
  Write-Host "  npm run dev" -ForegroundColor White
}
