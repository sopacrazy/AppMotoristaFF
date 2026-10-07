# FortFruit AppMotorista

Aplicativo de entregas para motoristas, feito com React/Vite e empacotado para Android com Capacitor. A API Express usa MySQL; comprovantes são enviados ao Supabase Storage.

## Desenvolvimento local

1. Instale as dependências com `npm ci`.
2. Copie `.env.example` para `.env` e configure os bancos e serviços necessários. O `.env` real é ignorado pelo Git.
3. No banco configurado em `DB_*`, crie as tabelas adicionais com `npm run db:tracking` e `npm run db:expenses`.
4. Suba API e frontend com `npm run dev:all`.

O frontend usa a porta 4002. A API usa `PORT` do `.env` (3005 no exemplo). Para gerar um APK de desenvolvimento, use `npm run apk:debug` com Android SDK/Gradle configurados.

## Recursos recentes

- O rastreamento Android envia a posição durante a jornada e mantém histórico de dois dias. Detalhes em [docs/rastreamento-desenvolvimento.md](docs/rastreamento-desenvolvimento.md).
- A prestação de despesas salva cabeçalho e itens em `expense_reports` e `expense_items`. Alterações são autenticadas pelo token do motorista e ficam em fila local se não houver conexão.

Atualizações OTA de arquivos web não instalam alterações no serviço nativo Android; mudanças nativas exigem um novo APK.
