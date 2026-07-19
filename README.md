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

### Importante: URL de redirect do Supabase

Depois que a Netlify te der a URL do site (ex: `https://mesa-financeiro.netlify.app`),
vá no Supabase em **Authentication → URL Configuration** e adicione essa URL em
**Site URL** e em **Redirect URLs**. Sem isso, o link mágico de login não volta pro app.

## 5. Instalar no celular

Abra a URL da Vercel no Safari (iPhone) ou Chrome (Android) → menu de compartilhar/opções →
**Adicionar à Tela de Início**. A partir daí abre como app, com ícone próprio.

## Estrutura

- `src/App.jsx` — toda a interface e lógica (classificação por palavra-chave, gráfico, reserva de emergência)
- `src/supabaseClient.js` — conexão com o Supabase
- `supabase/schema.sql` — tabelas + políticas de segurança (RLS)
- `vite.config.js` — configuração do PWA (manifest, ícones, service worker)
- `netlify.toml` + `public/_redirects` — configuração de build e roteamento na Netlify

## Notas

- Os dados de exemplo (Mar/Mai/Jun 2026) que estavam no protótipo **não vêm pré-carregados**
  aqui — insira as faturas reais pela tela "Adicionar fatura do mês" ou "Colar lançamentos".
- Como os cartões são compartilhados com o Sidney, considere criar logins separados
  (dois usuários no Supabase) se quiser separar gasto pessoal de gasto conjunto no futuro —
  o schema já suporta isso porque tudo é filtrado por `user_id`.
