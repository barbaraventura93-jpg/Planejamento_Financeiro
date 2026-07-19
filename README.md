# Mesa Financeiro (PWA)

Painel de faturas, parcelamentos, classificação de lançamentos e reserva de emergência —
instalável como app no celular, dados salvos no Supabase (não somem ao atualizar).

## 1. Subir pro GitHub

```bash
cd mesa-pwa
git init
git add .
git commit -m "primeira versão"
```
Crie um repositório novo no GitHub (privado, já que tem dados financeiros) e siga as
instruções de `git remote add origin ...` / `git push`.

## 2. Criar o projeto no Supabase

1. Crie uma conta em supabase.com e um novo projeto.
2. Vá em **SQL Editor** → cole o conteúdo de `supabase/schema.sql` → **Run**.
   Isso cria as tabelas e já ativa o Row Level Security (cada login só vê os próprios dados).
3. Em **Authentication → Providers**, deixe o **Email** habilitado (magic link, sem senha).
4. Em **Project Settings → API**, copie `Project URL` e a chave `anon public`.
5. Copie `.env.example` para `.env` e cole esses dois valores.

## 3. Rodar localmente

```bash
npm install
npm run dev
```
Abra `http://localhost:5173`, digite seu e-mail, e clique no link que chegar na caixa de entrada.

## 4. Deploy na Netlify

Mesmo fluxo do SP Car Clean:

1. Netlify → **Add new site → Import an existing project** → conecte o repositório do GitHub.
2. Build settings (o `netlify.toml` já preenche isso, mas confira):
   - Build command: `npm run build`
   - Publish directory: `dist`
3. Em **Site settings → Environment variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (os mesmos valores do `.env`)
4. Deploy. A Netlify entrega em HTTPS, obrigatório para o PWA funcionar.

O arquivo `public/_redirects` já está incluído — ele faz o Netlify devolver `index.html`
em qualquer rota, o que é necessário para o retorno do link mágico de login funcionar.

**Depois desse passo 1, o deploy já é automático**: toda vez que você der `git push` na
branch `main`, a Netlify detecta o commit sozinha, roda o build e publica — não precisa
rodar nada manualmente. Pra conferir se já está assim, entre no painel do site na Netlify
e veja em **Site configuration → Build & deploy → Continuous deployment** se o repositório
do GitHub aparece conectado.

### Importante: URL de redirect do Supabase

Depois que a Netlify te der a URL do site (ex: `https://mesa-financeiro.netlify.app`),
vá no Supabase em **Authentication → URL Configuration** e adicione essa URL em
**Site URL** e em **Redirect URLs**. Sem isso, o link mágico de login não volta pro app.

## 5. Atualização automática do banco (Supabase) a cada push

Além da Netlify, o repositório também tem uma automação (`.github/workflows/supabase-deploy.yml`)
que aplica mudanças de schema no Supabase sozinha sempre que um push em `main` mexe em algo
dentro de `supabase/migrations/`. Isso substitui o passo manual de colar SQL no SQL Editor
**para mudanças futuras** — o schema atual (o que você já rodou na mão no passo 2) continua
igual, isso aqui só automatiza o que vier depois.

### 5.1 Configurar uma vez (por projeto Supabase)

1. Instale o Supabase CLI localmente só pra fazer esse setup inicial (não precisa depois):
   ```bash
   npx supabase login
   ```
   Isso abre o navegador pra gerar um **access token** — guarde esse token.
2. Pegue o **project ref** do seu projeto: Supabase → **Project Settings → General** → "Reference ID".
3. Rode, na raiz do repositório:
   ```bash
   npx supabase link --project-ref SEU_PROJECT_REF
   ```
   Vai pedir a senha do banco (a mesma que você definiu ao criar o projeto Supabase).
4. Como o schema básico (`0001_init.sql`) já está rodando no seu projeto desde o passo 2
   (você colou na mão), diga ao CLI que essa migration já foi aplicada, sem executá-la de novo:
   ```bash
   npx supabase migration repair --status applied 0001
   ```
5. No GitHub, vá em **Settings → Secrets and variables → Actions** e adicione 3 secrets:
   - `SUPABASE_ACCESS_TOKEN` — o token gerado no passo 1
   - `SUPABASE_DB_PASSWORD` — a senha do banco do passo 3
   - `SUPABASE_PROJECT_REF` — o project ref do passo 2

### 5.2 No dia a dia

A partir daí, qualquer mudança de schema vira um novo arquivo em `supabase/migrations/`
(ex: `0003_nova_tabela.sql`). Ao dar `git push` na `main`, o GitHub Actions aplica
automaticamente essa migration no banco de produção — sem precisar abrir o SQL Editor.
Nada acontece se o push não tocar em `supabase/migrations/`.

Essas credenciais (access token, senha do banco) são sensíveis: ficam só como secrets do
GitHub, nunca no código nem no `.env` do projeto.

## 6. Instalar no celular

Abra a URL da Vercel no Safari (iPhone) ou Chrome (Android) → menu de compartilhar/opções →
**Adicionar à Tela de Início**. A partir daí abre como app, com ícone próprio.

## Estrutura

- `src/App.jsx` — toda a interface e lógica (classificação por palavra-chave, gráfico, reserva de emergência)
- `src/supabaseClient.js` — conexão com o Supabase
- `supabase/schema.sql` — schema completo, pra colar na mão num projeto novo (SQL Editor)
- `supabase/migrations/` — as mesmas tabelas divididas em migrations, usadas pela automação do GitHub Actions
- `supabase/config.toml` — configuração mínima pro Supabase CLI (usada só pela automação)
- `.github/workflows/supabase-deploy.yml` — aplica migrations pendentes no Supabase a cada push em `main`
- `vite.config.js` — configuração do PWA (manifest, ícones, service worker)
- `netlify.toml` + `public/_redirects` — configuração de build e roteamento na Netlify

## Notas

- Os dados de exemplo (Mar/Mai/Jun 2026) que estavam no protótipo **não vêm pré-carregados**
  aqui — insira as faturas reais pela tela "Adicionar fatura do mês" ou "Colar lançamentos".
- Como os cartões são compartilhados com o Sidney, considere criar logins separados
  (dois usuários no Supabase) se quiser separar gasto pessoal de gasto conjunto no futuro —
  o schema já suporta isso porque tudo é filtrado por `user_id`.
- Ao revisar lançamentos importados (ou editar a categoria de um já salvo), o app aprende:
  da próxima vez que a mesma descrição aparecer, ele já usa a categoria que você escolheu
  em vez do palpite por palavra-chave.
- A lista de "Assinaturas identificadas" agora é calculada a partir dos lançamentos reais
  classificados como "Assinaturas" — não é mais uma lista fixa no código.
- Tem um botão "Exportar CSV" na seção de faturas registradas para baixar o histórico.
