# Rastreamento de rota (desenvolvimento)

O APK Android inicia um serviço de localização quando o motorista inicia a jornada. O serviço continua ativo com a tela bloqueada ou após o app sair de primeiro plano, coleta uma posição a cada minuto quando há uma leitura recente de GPS e envia lotes para `POST /tracking/positions`. Se a conexão falhar, os pontos ficam em uma fila SQLite no aparelho por até dois dias. Ao finalizar a jornada, o app encerra o serviço e envia `POST /tracking/stop`.

Cada ponto é vinculado ao motorista autenticado e ao código da rota. O servidor guarda o histórico por dois dias e mantém a última posição em `tracking_latest`. Uma limpeza automática roda a cada hora.

## Preparar o ambiente local

1. Configure o banco MySQL nas variáveis `DB_*` do `.env`.
2. Execute `npm run db:tracking` para criar as três tabelas de rastreamento.
3. Execute `npm run dev:all` para subir a API e o frontend.
4. Execute `npm run apk:debug` para gerar um APK com o serviço nativo. Atualizações OTA de arquivos web não instalam esse serviço Android.

O teste HTTP e de banco pode ser executado com `node scripts/smoke-tracking.js`; ele cria e remove seus próprios registros. O teste usa a API local indicada por `TRACKING_SMOKE_URL` ou pela porta `PORT` do `.env`.

## Consulta pelo futuro sistema de monitoramento

Configure `TRACKING_READ_KEY` no servidor com um segredo de pelo menos 32 caracteres. A consulta exige `Authorization: Bearer <segredo>`:

- `GET /tracking/latest`: última posição de cada motorista, com o indicador `online` para uma posição ativa capturada nos últimos três minutos.
- `GET /tracking/history/:motorista?from=<ISO>&to=<ISO>`: até 5.000 posições no intervalo informado, dentro dos últimos dois dias.

As posições usam latitude/longitude em graus decimais, velocidade em metros por segundo e horários UTC em formato ISO 8601. O endpoint de leitura responde `503` enquanto `TRACKING_READ_KEY` não estiver configurada.

O Android pode interromper o rastreamento se o usuário forçar a parada do aplicativo nas configurações ou revogar a permissão de localização. Uma jornada iniciada em uma versão antiga do APK precisa da nova versão nativa para rastrear em segundo plano.
