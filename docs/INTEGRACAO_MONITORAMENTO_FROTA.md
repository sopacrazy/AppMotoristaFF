# Integração do monitoramento de frota — AppMotorista FortFruit

Este documento é o contrato para implementar **no outro sistema** um mapa com a posição dos motoristas em jornada e o trajeto recente de cada rota. A coleta de GPS já pertence ao APK Android do AppMotorista; o sistema de monitoramento deve apenas consultar a API descrita aqui.

**Estado em 07/10/2026:** a atualização está implementada e testada em desenvolvimento. A API e o novo APK ainda precisam ser publicados antes de receber posições dos 40 aparelhos em produção. A URL pública prevista pelo AppMotorista é `https://academy.fortfruit.com.br/`; confirme que as rotas abaixo estão disponíveis nela após a publicação.

## Identificação e frequência

- Cada posição é identificada por `motorista` e `routeCode` (código da rota). **Ainda não existe identificador ou placa do caminhão** nessa integração.
- O APK tenta coletar uma posição a cada 60 segundos durante a jornada, desde que o Android tenha uma leitura recente de localização e permissão concedida.
- O rastreamento começa quando a jornada é iniciada e termina quando ela é finalizada. O serviço Android continua em segundo plano com a tela bloqueada ou o app fora de primeiro plano.
- Se o aparelho estiver sem internet, guarda os pontos localmente e os envia depois. Portanto, `receivedAt` pode ser muito posterior a `capturedAt`.
- O histórico fica disponível por **48 horas**. O servidor remove dados vencidos em uma limpeza horária.

## Autenticação entre sistemas

As duas consultas abaixo exigem o cabeçalho:

```http
Authorization: Bearer <TRACKING_READ_KEY>
```

Antes da integração, configurar **a mesma** variável `TRACKING_READ_KEY`, com pelo menos 32 caracteres, no servidor do AppMotorista e como segredo no backend do sistema de monitoramento. O backend do monitor deve chamar a API e repassar ao seu frontend apenas os dados necessários. Nunca colocar essa chave no JavaScript entregue ao navegador, no APK ou no repositório.

O token emitido no login dos motoristas serve exclusivamente para o envio de pontos pelo APK; **não** usá-lo no monitoramento.

Para desenvolvimento, a API local usa `http://127.0.0.1:3005` quando o `.env` atual do AppMotorista está em uso. Em produção, usar a URL pública efetivamente publicada, sem o prefixo `/api` nas rotas abaixo.

## 1. Última posição de todos os motoristas

```http
GET /tracking/latest
Authorization: Bearer <TRACKING_READ_KEY>
```

Resposta `200`: um array JSON, com **no máximo uma posição por motorista** que tenha um ponto capturado nas últimas 48 horas. O array pode estar vazio. Exemplo ilustrativo:

```json
[
  {
    "motorista": "123",
    "routeCode": "ROTA-07",
    "latitude": "-1.4558000",
    "longitude": "-48.4902000",
    "accuracy": 12,
    "speed": 4.2,
    "heading": 90,
    "capturedAt": "2026-10-07T18:00:00.000000Z",
    "receivedAt": "2026-10-07T18:00:04.000000Z",
    "online": 1
  }
]
```

| Campo | Uso no monitor |
| --- | --- |
| `motorista` | Identificador do motorista; usar como chave estável do marcador. |
| `routeCode` | Código da rota; pode ser `null`. |
| `latitude`, `longitude` | Graus decimais. O MySQL pode devolvê-los como **strings decimais**; converter para número antes de desenhar no mapa. |
| `accuracy` | Precisão estimada em metros; pode ser `null`. |
| `speed` | Velocidade em metros por segundo; pode ser `null`. Para km/h, multiplicar por `3,6`. |
| `heading` | Direção em graus, de 0 a 360; pode ser `null`. |
| `capturedAt` | Instante da leitura de GPS em UTC; usar para mostrar a idade real da posição. |
| `receivedAt` | Instante em que a API recebeu o ponto, em UTC. |
| `online` | Número `1` quando a jornada de rastreio está ativa **e** `capturedAt` está nos últimos 3 minutos; caso contrário, `0`. |

Uma jornada finalizada pode continuar aparecendo em `/tracking/latest` por até 48 horas, com `online: 0`. `online: 0` também pode significar GPS ou conexão indisponível; não apresentar isso como prova de que a jornada foi encerrada. Use `capturedAt` para informar há quanto tempo a posição foi registrada.

## 2. Histórico de um motorista

```http
GET /tracking/history/:motorista?from=<ISO_UTC>&to=<ISO_UTC>
Authorization: Bearer <TRACKING_READ_KEY>
```

`from` e `to` são obrigatórios, em formato ISO 8601, com `from <= to`. O início precisa estar dentro das últimas 48 horas. Codifique os parâmetros na URL. A resposta `200` é um array JSON em ordem crescente de `capturedAt`, limitado a **5.000 pontos por requisição**. Exemplo ilustrativo:

```json
[
  {
    "pointId": "e2a9f5c2-f98b-41e7-bae8-83b732afcb45",
    "sessionId": "8cfe0a54-e709-40cc-b809-0a035b86da81",
    "routeCode": "ROTA-07",
    "latitude": "-1.4558000",
    "longitude": "-48.4902000",
    "accuracy": 12,
    "speed": 4.2,
    "heading": 90,
    "capturedAt": "2026-10-07T18:00:00.000000Z",
    "receivedAt": "2026-10-07T18:00:04.000000Z"
  }
]
```

`sessionId` identifica uma jornada de rastreio. Ao desenhar o trajeto, agrupe por `sessionId` para não ligar jornadas diferentes com uma linha. O histórico pode conter pontos enviados após um período offline; sempre ordenar pela hora de captura. Para consultas maiores que 5.000 pontos, dividir o período em intervalos menores: **não há paginação** nesse endpoint.

## Implementação esperada no outro sistema

1. Criar no **backend** um cliente HTTP para as duas rotas acima, com a chave em variável de ambiente e timeout apropriado.
2. Criar no frontend um mapa que consulte seu próprio backend a cada **30 segundos**. Uma chamada a `/tracking/latest` já traz todos os motoristas; não fazer uma chamada por caminhão.
3. Colocar um marcador por `motorista`, com código da rota, hora de `capturedAt`, idade da posição e estado `online`. Usar estilo visual distinto para `online: 0`.
4. Ao selecionar um motorista, consultar o histórico do intervalo desejado e desenhar a linha do trajeto por `sessionId`. Oferecer no máximo as últimas 48 horas.
5. Tratar latitude/longitude como números após a conversão; validar limites (`-90..90` e `-180..180`) antes de passar ao componente de mapa.
6. Se o monitor armazenar uma cópia dos pontos, aplicar também o limite de retenção de 48 horas solicitado para este projeto.
7. Diferenciar falha da API de ausência de caminhões: um array vazio é válido; `401`, `503` ou falha de rede devem aparecer como indisponibilidade da consulta.

O monitor **não** precisa chamar `POST /tracking/positions` nem `POST /tracking/stop`: esses endpoints são usados pelo APK. Esta API disponibiliza leitura por HTTP; não há WebSocket ou envio automático de eventos ao monitor.

## Erros e preparação para produção

| Situação | Resposta da API |
| --- | --- |
| Chave ausente ou incorreta | `401` com `{ "error": "Não autorizado" }` quando a chave do servidor está configurada. |
| `TRACKING_READ_KEY` não configurada ou menor que 32 caracteres no AppMotorista | `503` com `{ "error": "TRACKING_READ_KEY não configurada" }`. |
| Intervalo de histórico inválido ou fora das últimas 48 horas | `400` com mensagem em `error`. |
| Erro de consulta ao banco | `500` com mensagem em `error`. |

Para a integração real, ainda será necessário publicar a API com as tabelas de rastreamento, configurar `TRACKING_READ_KEY` e distribuir um APK Android que contenha o serviço nativo. Uma atualização OTA apenas dos arquivos web não instala esse serviço. Forçar a parada do aplicativo nas configurações do Android ou revogar sua permissão de localização interrompe a coleta.

Referências no repositório do AppMotorista: `trackingRoutes.js` (contrato e consultas), `scripts/tracking-schema.sql` (tabelas), `android/app/src/main/java/com/fasttrack/driver/TrackingService.java` (coleta e envio) e `docs/rastreamento-desenvolvimento.md` (preparo local).
