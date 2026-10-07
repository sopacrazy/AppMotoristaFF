# 📦 Como Criar o Bucket no Supabase

## ⚠️ IMPORTANTE: Você está procurando no lugar errado!

Você está na seção **Table Editor** (tabelas do banco de dados), mas precisa ir na seção **Storage** (arquivos/imagens).

## 🎯 Passo a Passo Visual

### 1. Localizar a Seção Storage
- No menu lateral esquerdo do Supabase, procure pelo ícone de **📁 pasta** (Storage)
- **NÃO** use o ícone de tabela/grid (Table Editor)
- Clique em **Storage**

### 2. Criar o Bucket
- Você verá uma lista de buckets (provavelmente vazia)
- Clique no botão **"New bucket"** ou **"+ New bucket"**
- Preencha:
  - **Name:** `comprovantes` (exatamente assim, sem espaços)
  - **Public bucket:** ✅ Marque como **SIM**
  - **File size limit:** Deixe padrão
- Clique em **Create bucket**

### 3. Configurar Políticas (OBRIGATÓRIO)
Após criar o bucket:

1. Clique no bucket `comprovantes` que você acabou de criar
2. Vá na aba **"Policies"** (no topo do bucket)
3. Clique em **"New Policy"**
4. Selecione **"Create a policy from scratch"**

**Política 1 - Upload:**
- Policy name: `Allow public uploads`
- Allowed operation: `INSERT`
- Target roles: `anon`
- Policy definition: deixe vazio
- Clique em **Review** → **Save policy**

**Política 2 - Leitura:**
- Policy name: `Allow public reads`
- Allowed operation: `SELECT`
- Target roles: `anon`
- Policy definition: deixe vazio
- Clique em **Review** → **Save policy**

## ✅ Verificação

Após criar o bucket e as políticas:
1. Recarregue a página do app (F5)
2. Tente enviar uma foto
3. No console (F12), você deve ver: `✅ Bucket encontrado: comprovantes`

## 🆘 Ainda não funciona?

Se ainda der erro após criar o bucket:
1. Verifique se o bucket está **público** (Public bucket = SIM)
2. Verifique se as **políticas** foram criadas (INSERT e SELECT)
3. Verifique se reiniciou o servidor após configurar o `.env`
4. Verifique o console do navegador para mensagens de erro específicas
