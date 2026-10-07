# 🔧 Configurar Supabase para Upload de Fotos

## ⚠️ Problema Atual

O erro `Failed to fetch` e `ERR_NAME_NOT_RESOLVED` indica que o Supabase não está configurado ou não está acessível.

## 📋 Passo a Passo para Configurar

### 1. Criar Conta no Supabase (se ainda não tiver)

1. Acesse: https://supabase.com
2. Crie uma conta gratuita
3. Crie um novo projeto

### 2. Criar Bucket de Storage ⚠️ IMPORTANTE

1. No painel do Supabase, vá em **Storage** (ícone de pasta no menu lateral)
2. Clique no botão **New bucket** (ou **+ New bucket**)
3. **Nome:** `comprovantes` (exatamente este nome, sem espaços)
4. **Public bucket:** ✅ Marque como **SIM** (isso permite acesso público às imagens)
5. **File size limit:** Deixe o padrão ou configure conforme necessário
6. Clique em **Create bucket**

**⚠️ ATENÇÃO:** Se você não criar o bucket, o upload sempre falhará!

### 3. Configurar Políticas de Acesso (OBRIGATÓRIO)

Após criar o bucket, você PRECISA configurar as políticas de acesso:

1. No painel do Supabase, vá em **Storage** → clique no bucket `comprovantes`
2. Vá na aba **Policies** (ou clique em "Policies" no menu do bucket)
3. Clique em **New Policy** ou use o template **Create a policy from scratch**

**Política 1 - Permitir Upload (INSERT):**
- **Policy name:** `Allow public uploads`
- **Allowed operation:** `INSERT`
- **Target roles:** Selecione `anon` (para permitir uploads sem autenticação)
- **Policy definition:** Deixe vazio ou coloque `true` para permitir tudo
- Clique em **Review** e depois **Save policy**

**Política 2 - Permitir Leitura (SELECT):**
- **Policy name:** `Allow public reads`
- **Allowed operation:** `SELECT`
- **Target roles:** Selecione `anon`
- **Policy definition:** Deixe vazio ou coloque `true`
- Clique em **Review** e depois **Save policy**

**⚠️ IMPORTANTE:** Sem essas políticas, o upload falhará mesmo que o bucket exista!

### 4. Obter Credenciais

1. No painel do Supabase, vá em **Settings** → **API**
2. Copie:
   - **Project URL** (ex: `https://xxxxx.supabase.co`)
   - **anon public** key (chave pública anônima)

### 5. Configurar no Projeto

Crie ou edite o arquivo `.env` na raiz do projeto:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-public-aqui
```

**⚠️ IMPORTANTE:**
- Substitua `seu-projeto` pelo ID do seu projeto
- Substitua `sua-chave-anon-public-aqui` pela chave anon public do Supabase
- Não compartilhe essas credenciais publicamente!

### 6. Reiniciar o Servidor

Após configurar o `.env`:

```bash
# Parar o servidor (Ctrl+C)
# Reiniciar
npm run dev
```

## 🔍 Verificar se Está Funcionando

1. Abra o console do navegador (F12)
2. Tente enviar uma foto
3. Verifique se não há mais erros de "Failed to fetch"
4. Se ainda houver erro, verifique:
   - Se as variáveis estão no `.env`
   - Se o bucket `comprovantes` existe
   - Se o bucket está público
   - Se há políticas de acesso configuradas

## 🐛 Solução de Problemas

### Erro: "Supabase não configurado"
- Verifique se o arquivo `.env` existe na raiz do projeto
- Verifique se as variáveis começam com `VITE_`
- Reinicie o servidor após adicionar as variáveis

### Erro: "Failed to fetch"
- Verifique sua conexão com internet
- Verifique se a URL do Supabase está correta
- Verifique se o bucket existe e está público

### Erro: "StorageUnknownError"
- Verifique se o bucket `comprovantes` existe
- Verifique as políticas de acesso do bucket
- Verifique se a chave anon está correta

## 📝 Exemplo de .env

```env
# Backend
PORT=4002

# Supabase
VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYxNjIzOTAyMiwiZXhwIjoxOTMxODE1MDIyfQ.exemplo-chave-aqui
```

## ✅ Checklist

- [ ] Conta no Supabase criada
- [ ] Projeto criado no Supabase
- [ ] Bucket `comprovantes` criado
- [ ] Bucket configurado como público
- [ ] Credenciais copiadas (URL e anon key)
- [ ] Arquivo `.env` criado na raiz
- [ ] Variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` configuradas
- [ ] Servidor reiniciado após configurar `.env`
- [ ] Teste de upload realizado
