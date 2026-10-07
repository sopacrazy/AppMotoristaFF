import express from "express";
import mysql from "mysql2";
import cors from "cors";
import "dotenv/config"; // Maneira moderna de carregar o dotenv
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import {
  issueTrackingToken,
  registerTrackingRoutes,
} from "./trackingRoutes.js";
import { registerExpenseRoutes } from "./expenseRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4010; // Porta alterada para 4010 para evitar conflitos

// =================== CONFIGURAÇÃO TOMTOM (TRÂNSITO) ===================
// Insira sua chave aqui ou no arquivo .env como TOMTOM_API_KEY
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY || "SUA_API_KEY_AQUI";

// BBOX TESTE - SÃO PAULO (Para validar se os alertas aparecem)
// const TOMTOM_BBOX = "-46.825,-23.682,-46.365,-23.356";

// BBOX ORIGEM - BELÉM (Descomente abaixo e comente o de cima para voltar)
const TOMTOM_BBOX = "-48.5506,-1.5000,-48.3500,-1.2800";

// =================== Fuso horário ===================
const TZ_OFFSET = process.env.TZ_OFFSET || "-03:00"; // Brasília (UTC-3)
const NOW_TZ = `CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${TZ_OFFSET}')`;

// =================== MySQL ===================
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "app_db",
  waitForConnections: true,
  connectionLimit: 10,
});

// toda conexão criada pelo pool já fica no fuso desejado
db.on("connection", (conn) => {
  conn.query(`SET time_zone = ?`, [TZ_OFFSET]);
});

db.getConnection((err, conn) => {
  if (err) {
    console.error("❌ Erro ao conectar ao MySQL:", err.message);
    console.error("   Verifique as variáveis de ambiente:");
    console.error("   DB_HOST:", process.env.DB_HOST || "NÃO DEFINIDO");
    console.error("   DB_USER:", process.env.DB_USER || "NÃO DEFINIDO");
    console.error("   DB_NAME:", process.env.DB_NAME || "NÃO DEFINIDO");
    // Não encerra o processo imediatamente - permite que o servidor inicie
    // mas as rotas que precisam do DB falharão
    console.warn(
      "⚠️ Servidor iniciará, mas rotas de banco de dados não funcionarão!",
    );
    return;
  }
  console.log("✅ Conectado ao MySQL");
  console.log("   Host:", process.env.DB_HOST || "localhost");
  console.log("   Database:", process.env.DB_NAME || "app_db");
  conn.release();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// =================== PAINEL ADMIN ===================
app.use("/admin", express.static(path.join(__dirname, "admin")));
app.get("/admin/public-config", (_req, res) => {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return res.status(503).json({ error: "Supabase não configurado" });
  res.set("Cache-Control", "no-store").json({ url, anonKey });
});

// =================== SERVIDOR ===================
// =================== CORS ===================
const allowList = [
  /^https?:\/\/localhost(?::\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(?::\d+)?$/,
  /^https?:\/\/10\.0\.2\.2(?::\d+)?$/,
  /^https:\/\/rota\.fortfruit\.com\.br$/,
  /^https:\/\/rotaff\.onrender\.com$/,
  /^https:\/\/meufrontend\.com$/,
  /^https:\/\/academy\.fortfruit\.com\.br$/,
];

app.use((req, _res, next) => {
  // Log de origem apenas em desenvolvimento
  if (process.env.NODE_ENV !== "production" && req.headers.origin) {
    console.log("Origin:", req.headers.origin, "→", req.method, req.path);
  }
  next();
});

// O middleware CORS lida automaticamente com os requests OPTIONS
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      const ok = allowList.some((re) =>
        re.test ? re.test(origin) : re === origin,
      );
      return cb(ok ? null : new Error("Não permitido pelo CORS"), ok);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  }),
);

// =================== COMPATIBILIDADE DE ROTAS ===================
// Aceita chamadas com ou sem o prefixo /api (evita erros de cache no App)
app.use((req, res, next) => {
  // Log global de chamadas para debug em produção

  if (req.url.startsWith("/api/")) {
    req.url = req.url.substring(4);
    console.log(`      -> Redirecionado para: ${req.url}`);
  } else if (req.url === "/api") {
    req.url = "/";
  }
  next();
});

// =================== Introspecção da tabela rota_logs ===================
let cachedRotaLogsCols = null;
/**
 * Retorna os nomes reais das colunas:
 * { fotoCol, dateCols[], numSeqCol, deviceCol, appVerCol }
 */
function detectRotaLogsColumns() {
  return new Promise((resolve) => {
    if (cachedRotaLogsCols) return resolve(cachedRotaLogsCols);

    const sql = `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'rota_logs'
    `;
    db.query(sql, [process.env.DB_NAME || "app_db"], (err, rows) => {
      if (err) {
        console.warn("⚠️ Não foi possível inspecionar rota_logs:", err.message);
        cachedRotaLogsCols = {
          fotoCol: null,
          dateCols: [],
          numSeqCol: null,
          deviceCol: null,
          appVerCol: null,
        };
        return resolve(cachedRotaLogsCols);
      }

      const names = rows.map((r) => String(r.COLUMN_NAME));
      const lower = names.map((n) => n.toLowerCase());
      const has = (n) => lower.includes(String(n).toLowerCase());
      const pickOne = (...cands) => {
        for (const c of cands) {
          const idx = lower.indexOf(c.toLowerCase());
          if (idx !== -1) return names[idx];
        }
        return null;
      };

      const fotoCol = pickOne("fotourl", "foto_url", "foto");
      const dateCandidates = [
        "datahora",
        "data_hora",
        "created_at",
        "createdat",
        "data",
        "datetime",
        "timestamp",
        "hora",
      ];
      const dateCols = [];
      for (const cand of dateCandidates) {
        if (has(cand)) dateCols.push(names[lower.indexOf(cand.toLowerCase())]);
      }

      const numSeqCol = pickOne("numseq", "num_seq", "bilhete");
      const deviceCol = pickOne("dispositivo", "device", "user_agent");
      const appVerCol = pickOne(
        "appversion",
        "app_version",
        "versao_app",
        "app_version",
      );
      const codigoRotaCol = pickOne("codigo_rota", "codigorota", "zb_carga");

      const kmCol = pickOne("km", "quilometragem", "km_atual");

      cachedRotaLogsCols = {
        fotoCol,
        dateCols,
        numSeqCol,
        deviceCol,
        appVerCol,
        codigoRotaCol,
        kmCol,
      };
      resolve(cachedRotaLogsCols);
    });
  });
}

// =================== HEALTH CHECK ===================
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    port: PORT,
  });
});

// =================== Rotas de dados ===================

// FUNÇÃO DE MANIPULAÇÃO ÚNICA para /rotasgeral (com ou sem codMotorista)
const handleRotasGeral = (req, res) => {
  const codMotorista = req.params.codMotorista;
  const { data, dataInicio, dataFim } = req.query;

  const isFaturamento =
    !codMotorista ||
    String(codMotorista).toLowerCase() === "faturamento" ||
    String(codMotorista).toUpperCase() === "ALL";

  let sql = `
    SELECT
      ZH_CODIGO, ZH_NOME, ZH_VEICULO, ZH_MOTOR, ZH_NOMMOT, ZH_CONFERE,
      ZB_DTENTRE, ZB_NOMCLI, ZB_DESCOND, ZB_END, ZB_BAIRRO, ZB_NOMVEN,
      ZB_TOTBIL, ZB_NOTA, ZB_NUMSEQ, ZH_STATUS, ZH_FOTO_URL, chegada_em
    FROM entregas
    WHERE 1=1
  `;
  const params = [];

  if (dataInicio && dataFim) {
    sql += ` AND DATE(ZB_DTENTRE) BETWEEN ? AND ?`;
    params.push(dataInicio, dataFim);
  } else if (data) {
    sql += ` AND DATE(ZB_DTENTRE) = ?`;
    params.push(data);
  } else {
    sql += ` AND DATE(ZB_DTENTRE) = CURDATE()`;
  }

  if (!isFaturamento) {
    sql += ` AND ZH_MOTOR = ?`;
    params.push(codMotorista);
  }

  sql += ` ORDER BY ZB_DTENTRE DESC, ZB_NUMSEQ`;

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Erro /rotasgeral:", err);
      return res.status(500).send("Erro ao consultar o banco de dados.");
    }
    res.json(results);
  });
};

// REGISTRO DE DUAS ROTAS (para opcionalidade)
app.get("/rotasgeral/:codMotorista", handleRotasGeral);
app.get("/rotasgeral", handleRotasGeral);

app.get("/rotas", (_req, res) => {
  const query = `
SELECT 
    ZH.ZH_CODIGO, ZH.ZH_NOME, ZH.ZH_VEICULO, ZH.ZH_MOTOR, ZH.ZH_NOMMOT, ZH.ZH_CONFERE,
    ZB.ZB_DTENTRE, ZB.ZB_NOMCLI, ZB.ZB_DESCOND, ZB.ZB_END, ZB.ZB_BAIRRO, ZB.ZB_NOMVEN,
    ZB.ZB_TOTBIL, ZB.ZB_NOTA
FROM SZH140 AS ZH
INNER JOIN SZB140 AS ZB ON ZH.ZH_CODIGO = ZB.ZB_CARGA
WHERE ZH.ZH_FILIAL = '01' AND ZH.D_E_L_E_T_ = ''
  AND ZB.ZB_FILIAL = '01' AND ZB.ZB_DTENTRE = CURDATE()
  AND ZB.D_E_L_E_T_ = '' AND ZB.ZB_NUMSEQ <> ''
  `;
  db.query(query, (err, results) => {
    if (err) {
      console.error("Erro /rotas:", err);
      return res.status(500).send("Erro ao consultar o banco de dados.");
    }
    res.json(results);
  });
});

// =================== GAMIFICACAO (BADGES) ===================

// Rota de Feed da Comunidade (Quem ganhou o quê)
app.get("/badges/feed", (req, res) => {
  const sql = `
    SELECT 
      l.nome_motorista,
      b.name as badge_name,
      b.icon,
      ub.conquistado_em
    FROM user_badges ub
    INNER JOIN badges b ON ub.badge_id = b.id
    INNER JOIN login l ON ub.motorista_id = l.ZH_MOTOR
    WHERE ub.conquistado_em >= DATE_SUB(NOW(), INTERVAL 48 HOUR)
    ORDER BY ub.conquistado_em DESC
    LIMIT 5
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Erro /badges/feed:", err);
      // Retorna array vazio se der erro (ex: tabelas não existem ainda)
      return res.json([]);
    }
    res.json(results);
  });
});

app.get("/users/:userId/badges", (req, res) => {
  const { userId } = req.params; // userId será o motorista_id (ZH_MOTOR)

  const sql = `
    SELECT 
      b.id, 
      b.slug, 
      b.name, 
      b.description, 
      b.icon,
      CASE WHEN ub.id IS NOT NULL THEN TRUE ELSE FALSE END AS conquistado,
      ub.conquistado_em
    FROM badges b
    LEFT JOIN user_badges ub 
      ON b.id = ub.badge_id AND ub.motorista_id = ?
    ORDER BY conquistado DESC, b.name ASC
  `;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("Erro /api/users/:userId/badges:", err);
      // Se a tabela não existir, retorna array vazio para não quebrar o front
      if (err.code === "ER_NO_SUCH_TABLE") return res.json([]);
      return res.status(500).json({ error: "Erro ao buscar badges" });
    }

    // Tratamento dos dados para garantir boolean
    const badges = results.map((row) => ({
      ...row,
      conquistado: !!row.conquistado, // converte 1/0 para boolean
    }));

    res.json(badges);
  });
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  const query = `
    SELECT id, ZH_MOTOR AS codMotorista, nome_motorista
    FROM login
    WHERE username = ? AND password = ? 
  `;

  db.query(query, [username, password], async (err, results) => {
    if (err) {
      console.error("Erro /login:", err);
      return res.status(500).json({ error: "Erro no servidor" });
    }
    if (!results.length) {
      return res.status(401).json({ error: "Usuário ou senha incorretos" });
    }
    const user = results[0];
    const isAdmin = user.id === 62; // ID #62 é o admin conforme indicado pelo usuário
    let trackingToken = null;
    if (!isAdmin && user.codMotorista) {
      try {
        trackingToken = await issueTrackingToken(db, user.codMotorista);
      } catch (trackingError) {
        // O login continua disponível se a migração do rastreio ainda não foi aplicada.
        console.error(
          "Não foi possível emitir token de rastreio:",
          trackingError,
        );
      }
    }
    res.json({
      success: true,
      codMotorista: user.codMotorista,
      isAdmin,
      userId: user.id,
      name: user.nome_motorista,
      trackingToken,
    });
  });
});

registerTrackingRoutes(app, db);
registerExpenseRoutes(app, db);

// Rota para buscar nome e estatísticas (Dashboard)
app.get("/driver/stats/:codMotorista", (req, res) => {
  const { codMotorista } = req.params;

  // Caso especial para Admin que não tem codMotorista vinculado
  if (codMotorista === "ALL" || !codMotorista) {
    return res.json({
      name: "Administrador do Sistema",
      totalDeliveries: 0,
      completed: 0,
      efficiency: 0,
      codMotorista: "ALL",
    });
  }

  // 1. Busca o nome do motorista na tabela 'login'
  // 🚨 ATENÇÃO: Usar 'nome_motorista' no SELECT e buscar por 'ZH_MOTOR'
  const queryName = `
    SELECT nome_motorista
    FROM login
    WHERE ZH_MOTOR = ?
  `;

  db.query(queryName, [codMotorista], (err, results) => {
    if (err) {
      console.error("Erro /driver/stats (name):", err);
      // Retorna 500 se o SQL falhar (ex: coluna inexistente)
      return res.status(500).json({ error: "Erro no servidor ao buscar nome" });
    }
    if (!results.length) {
      // Retorna 404 se o motorista não for encontrado
      return res.status(404).json({ error: "Motorista não encontrado." });
    }

    // 🚨 CORREÇÃO ESSENCIAL: Extrai o nome da coluna nome_motorista
    const driverName = results[0].nome_motorista;

    // 2. Busca as entregas do dia para calcular o progresso
    const queryDeliveries = `
        SELECT ZH_STATUS
        FROM entregas
        WHERE ZH_MOTOR = ? 
          AND DATE(ZB_DTENTRE) = CURDATE();
    `;

    db.query(queryDeliveries, [codMotorista], (err, deliveries) => {
      // ... (Restante da lógica para calcular stats e retornar JSON)
      if (err) {
        console.warn(
          "⚠️ Não foi possível carregar entregas para estatísticas.",
          err,
        );
        // Retorna nome real, mas estatísticas zeradas
        return res.json({
          name: driverName,
          totalDeliveries: 0,
          completed: 0,
          efficiency: 0,
          codMotorista: codMotorista,
        });
      }

      const total = deliveries.length;
      const completed = deliveries.filter(
        (d) => d.ZH_STATUS === "CONCLUIDA" || d.ZH_STATUS === "FINALIZADO",
      ).length;
      const efficiency = total > 0 ? Math.round((completed / total) * 100) : 0;

      res.json({
        name: driverName,
        totalDeliveries: total,
        completed: completed,
        efficiency: efficiency,
        codMotorista: codMotorista,
      });
    });
  });
});
app.get("/entregas/:codMotorista", (req, res) => {
  const { codMotorista } = req.params;
  const query = `
    SELECT *
    FROM entregas
    WHERE ZH_MOTOR = ?
      AND DATE(ZB_DTENTRE) = CURDATE();
  `;
  db.query(query, [codMotorista], (err, results) => {
    if (err) {
      console.error("Erro /entregas:", err);
      return res.status(500).json({ error: "Erro no servidor" });
    }
    res.json(results);
  });
});

// Rota para buscar entregas pendentes do motorista com filtro de data e paginação
app.get("/entregas-pendentes/:codMotorista", (req, res) => {
  const { codMotorista } = req.params;
  const { dataInicio, dataFim, data, page = "1", limit = "10" } = req.query;

  // Converter para números
  const pageNum = parseInt(String(page || "1"), 10) || 1;
  const limitNum = parseInt(String(limit || "10"), 10) || 10;
  const offset = (pageNum - 1) * limitNum;

  // Query para contar total (sem LIMIT)
  let countQuery = `
    SELECT COUNT(*) as total
    FROM entregas
    WHERE ZH_MOTOR = ?
      AND (ZH_STATUS IS NULL OR ZH_STATUS = '' OR ZH_STATUS NOT IN ('CONCLUIDA', 'FINALIZADO'))
  `;

  // Query principal
  let query = `
    SELECT 
      ZB_NUMSEQ, ZB_NOMCLI, ZB_END, ZB_BAIRRO, ZB_NOTA, 
      ZH_STATUS, ZH_FOTO_URL, ZB_DTENTRE, ZH_MOTOR, chegada_em
    FROM entregas
    WHERE ZH_MOTOR = ?
      AND (ZH_STATUS IS NULL OR ZH_STATUS = '' OR ZH_STATUS NOT IN ('CONCLUIDA', 'FINALIZADO'))
  `;

  const params = [codMotorista];
  const countParams = [codMotorista];

  // Filtro por data
  if (dataInicio && dataFim) {
    const dateFilter = ` AND DATE(ZB_DTENTRE) BETWEEN ? AND ?`;
    query += dateFilter;
    countQuery += dateFilter;
    params.push(dataInicio, dataFim);
    countParams.push(dataInicio, dataFim);
  } else if (data) {
    const dateFilter = ` AND DATE(ZB_DTENTRE) = ?`;
    query += dateFilter;
    countQuery += dateFilter;
    params.push(data);
    countParams.push(data);
  } else {
    // Se não especificar data, busca todas as pendentes (incluindo passadas)
    const dateFilter = ` AND DATE(ZB_DTENTRE) <= CURDATE()`;
    query += dateFilter;
    countQuery += dateFilter;
  }

  query += ` ORDER BY ZB_DTENTRE DESC, ZB_NUMSEQ LIMIT ? OFFSET ?`;
  params.push(limitNum, offset);

  // Executar ambas as queries
  db.query(countQuery, countParams, (err, countResult) => {
    if (err) {
      console.error("Erro /entregas-pendentes (count):", err);
      return res.status(500).json({ error: "Erro no servidor" });
    }

    const total = countResult[0]?.total || 0;

    db.query(query, params, (err, results) => {
      if (err) {
        console.error("Erro /entregas-pendentes:", err);
        return res.status(500).json({ error: "Erro no servidor" });
      }

      res.json({
        data: results,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    });
  });
});

// =================== MySQL OCORRENCIAS ===================
const dbOcorrencias = mysql.createPool({
  host: process.env.DB_HOST_OCORRENCIAS,
  user: process.env.DB_USER_OCORRENCIAS,
  password: process.env.DB_PASSWORD_OCORRENCIAS,
  database: process.env.DB_NAME_OCORRENCIAS,
  waitForConnections: true,
  connectionLimit: 5,
});

dbOcorrencias.getConnection((err, conn) => {
  if (err) {
    console.error("⚠️ Erro ao conectar ao MySQL Ocorrencias:", err.message);
    console.error("⚠️ Verifique as variáveis de ambiente:");
    console.error(
      "   DB_HOST_OCORRENCIAS:",
      process.env.DB_HOST_OCORRENCIAS || "NÃO DEFINIDO",
    );
    console.error(
      "   DB_NAME_OCORRENCIAS:",
      process.env.DB_NAME_OCORRENCIAS || "NÃO DEFINIDO",
    );
  } else {
    console.log("✅ Conectado ao MySQL Ocorrencias");
    console.log("   Host:", process.env.DB_HOST_OCORRENCIAS);
    console.log("   Database:", process.env.DB_NAME_OCORRENCIAS);
    conn.release();
  }
});

// =================== ENDPOINT DE TESTE DE OCORRÊNCIAS ===================
app.get("/test-ocorrencias", (req, res) => {
  if (!dbOcorrencias) {
    return res.status(500).json({
      error: "Conexão com banco de ocorrências não disponível",
      env: {
        DB_HOST_OCORRENCIAS: process.env.DB_HOST_OCORRENCIAS || "NÃO DEFINIDO",
        DB_NAME_OCORRENCIAS: process.env.DB_NAME_OCORRENCIAS || "NÃO DEFINIDO",
      },
    });
  }

  // Testa a conexão
  dbOcorrencias.query("SELECT 1 as test", (err, results) => {
    if (err) {
      return res.status(500).json({
        error: "Erro ao testar conexão",
        message: err.message,
        code: err.code,
      });
    }

    res.json({
      success: true,
      message: "Conexão com banco de ocorrências OK",
      test: results[0],
    });
  });
});

// Helper de Gamificação
const awardBadge = (motoristaId, badgeSlug) => {
  db.query(
    "SELECT id FROM badges WHERE slug = ?",
    [badgeSlug],
    (err, results) => {
      if (err || results.length === 0) return;
      const badgeId = results[0].id;
      db.query(
        "INSERT IGNORE INTO user_badges (motorista_id, badge_id, conquistado_em) VALUES (?, ?, NOW())",
        [motoristaId, badgeId],
        (errInsert, resInsert) => {
          if (!errInsert && resInsert.affectedRows > 0) {
            console.log(
              `🏆 Conquista Desbloqueada! Motorista ${motoristaId} ganhou '${badgeSlug}'`,
            );
          }
        },
      );
    },
  );
};

// Função compartilhada para registro de chegada
const handleRegistrarChegada = (req, res) => {
  const numSeq = req.params.numSeq;

  const sql = `
    UPDATE entregas 
    SET chegada_em = ${NOW_TZ}
    WHERE ZB_NUMSEQ = ? AND (chegada_em IS NULL)
  `;

  db.query(sql, [numSeq], (err, result) => {
    if (err) {
      console.error("Erro /registrar_chegada:", err);
      return res.status(500).json({ error: "Erro ao registrar chegada" });
    }

    if (result.affectedRows === 0) {
      return res
        .status(400)
        .json({ error: "Chegada já registrada ou entrega não encontrada" });
    }

    res.json({ success: true, message: "Chegada registrada com sucesso!" });
  });
};

app.post("/registrar_chegada/:numSeq", handleRegistrarChegada);
app.put("/registrar_chegada/:numSeq", handleRegistrarChegada);

app.put("/atualizar_status/:numSeq", (req, res) => {
  const { status, fotoUrl, capturedAtUtc, isPartial } = req.body;
  const numSeq = req.params.numSeq;

  if (!status) {
    return res.status(400).json({ error: "Campo 'status' é obrigatório" });
  }
  if (status === "CONCLUIDA" && !(fotoUrl && String(fotoUrl).trim() !== "")) {
    return res.status(400).json({ error: "URL da imagem não recebida" });
  }

  const setParts = [
    "ZH_STATUS = ?",
    "ZH_FOTO_URL = ?",
    "sincronizado_em = " + NOW_TZ,
  ];
  const params = [status, status === "NÃO ENTREGUE" ? null : fotoUrl];

  if (capturedAtUtc && typeof capturedAtUtc === "string") {
    setParts.push(
      `concluido_em = CONVERT_TZ(
          COALESCE(
            STR_TO_DATE(?, '%Y-%m-%dT%H:%i:%s.%fZ'),
            STR_TO_DATE(?, '%Y-%m-%dT%H:%i:%sZ')
          ),
          '+00:00', '${TZ_OFFSET}'
        )`,
    );
    params.push(capturedAtUtc, capturedAtUtc);
  } else if (status === "CONCLUIDA") {
    setParts.push(`concluido_em = ${NOW_TZ}`);
  }

  const sql = `
    UPDATE entregas
        SET ${setParts.join(", ")}
      WHERE ZB_NUMSEQ = ?
  `;
  params.push(numSeq);

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Erro /atualizar_status:", err);
      return res.status(500).json({ error: "Erro ao atualizar entrega" });
    }

    if (result.affectedRows === 0) {
      console.warn(
        `/atualizar_status: ZB_NUMSEQ '${numSeq}' não encontrado no banco.`,
      );
      return res.status(404).json({ error: "Entrega não encontrada" });
    }

    // --- GAMIFICAÇÃO AUTOMÁTICA ---
    if (status === "CONCLUIDA" || status === "FINALIZADO") {
      db.query(
        "SELECT ZH_MOTOR FROM entregas WHERE ZB_NUMSEQ = ?",
        [numSeq],
        (errM, resM) => {
          if (!errM && resM.length > 0) {
            const motoristaId = resM[0].ZH_MOTOR;

            // 1. Badge: Rei da Rota (50+ entregas)
            db.query(
              "SELECT COUNT(*) as total FROM entregas WHERE ZH_MOTOR = ? AND (ZH_STATUS='CONCLUIDA' OR ZH_STATUS='FINALIZADO')",
              [motoristaId],
              (errC, resC) => {
                if (!errC && resC[0].total >= 50) {
                  awardBadge(motoristaId, "rei_da_rota");
                }
              },
            );

            // 2. Badge: Madrugador (Concluir antes das 08:00)
            const currentHour = new Date().getHours();
            if (currentHour < 8) {
              awardBadge(motoristaId, "madrugador");
            }
          }
        },
      );
    }

    // --- LÓGICA DE ENTREGA PARCIAL ---
    const isPartialValue =
      isPartial === true ||
      isPartial === "true" ||
      isPartial === 1 ||
      isPartial === "1";

    if (isPartialValue) {
      const queryGet = `SELECT * FROM entregas WHERE ZB_NUMSEQ = ?`;

      db.query(queryGet, [numSeq], (errGet, results) => {
        if (errGet) {
          console.error("Erro ao buscar entrega para ocorrência:", errGet);
          return;
        }

        if (!results || results.length === 0) {
          console.error(
            "Entrega não encontrada para criar ocorrência:",
            numSeq,
          );
          return;
        }

        const entrega = results[0];

        // Verifica se dbOcorrencias está disponível
        if (!dbOcorrencias) {
          console.error("Conexão com banco de ocorrências não disponível!");
          return;
        }

        const sqlOco = `
          INSERT INTO ocorrencias (
            data, cliente, valor, nota_fiscal, bilhete, 
            motorista, placa, descricao, status, acao, obs, remetente, adicionado_pelo_app, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'S', NOW())
        `;
        const valoresOco = [
          entrega.ZB_DTENTRE,
          entrega.ZB_NOMCLI,
          entrega.ZB_TOTBIL,
          entrega.ZB_NOTA,
          entrega.ZB_NUMSEQ,
          entrega.ZH_NOMMOT,
          entrega.ZH_VEICULO,
          "ENTREGA PARCIAL",
          "PENDENTE",
          "DEVOLUÇÃO",
          `Foto: ${fotoUrl}`,
          entrega.ZB_NOMCLI || "NÃO INFORMADO",
        ];

        dbOcorrencias.query(sqlOco, valoresOco, (errOco) => {
          if (errOco) {
            console.error("Erro ao inserir ocorrência:", errOco);
          }
        });
      });
    }

    res.json({ success: true, message: "Entrega atualizada!" });
  });
});

// =================== LOGS DA ROTA (INSERT) ===================
// ⚠️ Sempre grava horário do BANCO (Brasília), ignorando dataHora do app
app.post("/rota_logs", async (req, res) => {
  const {
    motorista,
    acao,
    numSeq = null,
    fotoUrl = null,
    dispositivo = null,
    appVersion = null,
    codigoRota = null,
    km = null,
  } = req.body || {};

  if (!motorista || !acao) {
    return res
      .status(400)
      .json({ error: "Campos obrigatórios: motorista, acao" });
  }

  // Bloqueia encerramento sem nenhuma entrega concluída no dia
  if (acao === "ENCERRAR") {
    try {
      const [rows] = await db.promise().query(
        `SELECT COUNT(*) AS concluidas
         FROM entregas
         WHERE ZH_MOTOR = ?
           AND DATE(ZB_DTENTRE) = CURDATE()
           AND ZH_STATUS IN ('CONCLUIDA', 'FINALIZADO')`,
        [motorista],
      );
      if (rows[0].concluidas === 0) {
        return res.status(403).json({
          error:
            "Nenhuma entrega concluída. Finalize ao menos uma entrega antes de encerrar a jornada.",
        });
      }
    } catch (checkErr) {
      console.error("Erro ao validar entregas para encerramento:", checkErr);
      // Em caso de erro na validação, permite prosseguir para não travar o motorista
    }
  }

  const {
    fotoCol,
    dateCols,
    numSeqCol,
    deviceCol,
    appVerCol,
    codigoRotaCol,
    kmCol,
  } = await detectRotaLogsColumns();

  const cols = ["motorista", "acao"];
  const vals = [motorista, acao];
  const ph = ["?", "?"];

  if (numSeqCol) {
    cols.push(`\`${numSeqCol}\``);
    vals.push(numSeq);
    ph.push("?");
  }
  if (codigoRotaCol && codigoRota) {
    cols.push(`\`${codigoRotaCol}\``);
    vals.push(codigoRota);
    ph.push("?");
  }
  if (kmCol && km !== null) {
    cols.push(`\`${kmCol}\``);
    vals.push(km);
    ph.push("?");
  }

  // TODAS as colunas de data recebem NOW_TZ (horário do BD em Brasília)
  if (dateCols.length) {
    for (const dc of dateCols) {
      cols.push(`\`${dc}\``);
      ph.push(NOW_TZ);
    }
  }

  if (fotoCol) {
    cols.push(`\`${fotoCol}\``);
    vals.push(fotoUrl);
    ph.push("?");
  }
  if (deviceCol) {
    cols.push(`\`${deviceCol}\``);
    vals.push(dispositivo);
    ph.push("?");
  }
  if (appVerCol) {
    cols.push(`\`${appVerCol}\``);
    vals.push(appVersion);
    ph.push("?");
  }

  const sql = `INSERT INTO rota_logs (${cols.join(", ")}) VALUES (${ph.join(
    ", ",
  )})`;

  db.query(sql, vals, (err, result) => {
    if (err) {
      // Se for duplicidade, significa que já registrou hoje. Retornamos sucesso para não travar o app.
      if (err.code === "ER_DUP_ENTRY") {
        console.warn("⚠️ Log de rota duplicado ignorado:", err.sqlMessage);
        return res.json({ success: true, duplicate: true });
      }

      console.error("Erro /rota_logs (INSERT):", err);
      return res.status(500).json({ error: "Erro ao salvar log" });
    }
    res.json({
      success: true,
      id: result.insertId,
      usedColumns: { dateCols, fotoCol, numSeqCol, deviceCol, appVerCol },
    });
  });
});

// =================== MENSAGENS DO GESTOR ===================

// GET: Busca mensagens para um motorista — apenas das últimas 24h
app.get("/mensagens/:motorista_id", (req, res) => {
  const { motorista_id } = req.params;

  // Limpeza automática: deleta mensagens com mais de 24h
  db.query(
    "DELETE FROM driver_messages WHERE criado_em < DATE_SUB(NOW(), INTERVAL 24 HOUR)",
    (err) => {
      if (err)
        console.warn("Erro na limpeza de mensagens antigas:", err.message);
    },
  );

  const sql = `
    SELECT id, mensagem, foto_url, lida, criado_em
    FROM driver_messages
    WHERE motorista_id = ?
      AND criado_em >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
    ORDER BY lida ASC, criado_em DESC
    LIMIT 20
  `;
  db.query(sql, [motorista_id], (err, results) => {
    if (err) {
      console.error("Erro ao buscar mensagens:", err);
      return res.json([]);
    }
    res.json(results);
  });
});

// POST: Gestor envia mensagem para um motorista
app.post("/mensagens", (req, res) => {
  const { motorista_id, mensagem, foto_url } = req.body;
  if (!motorista_id || !mensagem) {
    return res
      .status(400)
      .json({ error: "motorista_id e mensagem são obrigatórios" });
  }
  const sql = `INSERT INTO driver_messages (motorista_id, mensagem, foto_url) VALUES (?, ?, ?)`;
  db.query(sql, [motorista_id, mensagem, foto_url || null], (err, result) => {
    if (err) {
      console.error("Erro ao inserir mensagem:", err);
      return res.status(500).json({ error: "Erro ao salvar mensagem" });
    }
    res.json({ success: true, id: result.insertId });
  });
});

// PUT: Motorista marca mensagem como lida
app.put("/mensagens/:id/lida", (req, res) => {
  const { id } = req.params;
  db.query("UPDATE driver_messages SET lida = 1 WHERE id = ?", [id], (err) => {
    if (err) {
      console.error("Erro ao marcar mensagem como lida:", err);
      return res.status(500).json({ error: "Erro ao atualizar" });
    }
    res.json({ success: true });
  });
});

// DELETE: Gestor deleta mensagem
app.delete("/mensagens/:id", (req, res) => {
  const { id } = req.params;
  db.query("DELETE FROM driver_messages WHERE id = ?", [id], (err) => {
    if (err) return res.status(500).json({ error: "Erro ao deletar" });
    res.json({ success: true });
  });
});

// GET ALL: Admin lista todas as mensagens (sem filtro ou com motorista_id)
app.get("/mensagens-admin", (req, res) => {
  const { motorista_id } = req.query;
  let sql = `SELECT id, motorista_id, mensagem, foto_url, lida, criado_em FROM driver_messages`;
  const params = [];
  if (motorista_id) {
    sql += " WHERE motorista_id = ?";
    params.push(motorista_id);
  }
  sql += " ORDER BY criado_em DESC LIMIT 100";
  db.query(sql, params, (err, results) => {
    if (err) return res.json([]);
    res.json(results);
  });
});

// POST: Upload de foto pelo admin (para mensagens)
app.post("/upload-message-photo", async (req, res) => {
  try {
    // Recebe base64 + mimeType no body
    const { base64, mimeType } = req.body;
    if (!base64 || !mimeType)
      return res
        .status(400)
        .json({ error: "base64 e mimeType são obrigatórios" });

    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !SUPABASE_KEY)
      return res.status(500).json({ error: "Supabase não configurado" });

    const ext = mimeType.split("/")[1] || "jpg";
    const fileName = `msg_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    const buffer = Buffer.from(base64, "base64");

    // Upload via REST API do Supabase Storage
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/comprovantes/${fileName}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": mimeType,
          "x-upsert": "false",
        },
        body: buffer,
      },
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(err);
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/comprovantes/${fileName}`;
    res.json({ url: publicUrl });
  } catch (err) {
    console.error("Erro upload mensagem foto:", err);
    res.status(500).json({ error: String(err) });
  }
});

// GET: Pesquisa global de bilhete (Para Admin #62)
app.get("/pesquisar-bilhete", (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const sql = `
    SELECT 
      ZB_NUMSEQ, ZB_NOMCLI, ZB_END, ZB_BAIRRO, ZB_NOTA, 
      ZH_STATUS, ZH_FOTO_URL, ZB_DTENTRE, ZH_MOTOR, chegada_em, ZH_NOMMOT
    FROM entregas
    WHERE ZB_NUMSEQ = ? OR ZB_NOTA = ? OR ZB_NOMCLI LIKE ?
    ORDER BY ZB_DTENTRE DESC
    LIMIT 10
  `;
  const likeQ = `%${q}%`;
  db.query(sql, [q, q, likeQ], (err, results) => {
    if (err) {
      console.error("Erro ao pesquisar bilhete:", err);
      return res.status(500).json({ error: "Erro na pesquisa" });
    }
    res.json(results);
  });
});

// GET: Lista todos os motoristas (Para o Admin selecionar no envio de msg)
app.get("/motoristas", (req, res) => {
  const sql = `
    SELECT id, ZH_MOTOR as codMotorista, nome_motorista, username
    FROM login
    WHERE ZH_MOTOR <> '' 
    ORDER BY nome_motorista ASC
  `;
  db.query(sql, (err, results) => {
    if (err)
      return res.status(500).json({ error: "Erro ao buscar motoristas" });
    res.json(results);
  });
});

app.get("/verificar_jornada/:codMotorista", async (req, res) => {
  const { codMotorista } = req.params;

  // Query mais robusta: verifica em múltiplas colunas de data possíveis
  // isso evita erros de detecção de coluna
  const sql = `
    SELECT id, acao, created_at, data_hora, dataHora, km
    FROM rota_logs 
    WHERE motorista = ?       AND acao IN ('INICIO', 'ENCERRAR')
      AND (
        DATE(created_at) = CURDATE() OR 
        DATE(data_hora) = CURDATE() OR 
        DATE(dataHora) = CURDATE()
      )
    ORDER BY id DESC
    LIMIT 1
  `;

  db.query(sql, [codMotorista], (err, results) => {
    if (err) {
      console.error("Erro /verificar_jornada:", err);
      // Retorna false, mas loga o erro
      return res.json({ jornadaIniciada: false });
    }

    if (results.length > 0) {
      const row = results[0];
      const isActive = row.acao === "INICIO";
      const isEnded = row.acao === "ENCERRAR";
      // Pega qualquer data válida retornada
      const dataInicio = row.dataHora || row.data_hora || row.created_at;

      return res.json({
        jornadaIniciada: isActive,
        jornadaEncerrada: isEnded,
        horaInicio: dataInicio,
        km: row.km,
      });
    }

    // Nada encontrado hoje -> jornada não iniciada
    res.json({ jornadaIniciada: false });
  });
});

// (Opcional) Listar logs: ?motorista=XXX&data=YYYY-MM-DD
app.get("/rota_logs", async (req, res) => {
  const { motorista, data } = req.query;
  const { dateCols } = await detectRotaLogsColumns();

  let sql = `SELECT * FROM rota_logs WHERE 1= 1`;
  const params = [];

  if (motorista) {
    sql += ` AND motorista = ? `;
    params.push(motorista);
  }

  if (data && dateCols.length) {
    sql += ` AND DATE(\`${dateCols[0]}\`) = ?`;
    params.push(data);
  } else if (data && !dateCols.length) {
    console.warn(
      "⚠️ /rota_logs GET: tabela sem coluna de data; ignorando filtro 'data'",
    );
  }

  if (dateCols.length) sql += ` ORDER BY \`${dateCols[0]}\` ASC, id ASC`;
  else sql += ` ORDER BY id ASC`;

  db.query(sql, params, (err, results) => {
    if (err) {
      console.error("Erro /rota_logs (GET):", err);
      return res.status(500).json({ error: "Erro ao buscar logs" });
    }
    res.json(results);
  });
});

// =================== Diagnóstico de fuso ===================
app.get("/debug/time", (_req, res) => {
  db.query(
    `SELECT 
        @@global.time_zone    AS global_tz,
        @@session.time_zone   AS session_tz,
        NOW()                 AS now_session,
        UTC_TIMESTAMP()       AS now_utc,
        ${NOW_TZ}             AS now_br
      `,
    (err, rows) => {
      if (err) return res.status(500).json({ error: String(err) });
      res.json(rows[0]);
    },
  );
});

// =================== AUTO-UPDATE SYSTEM ===================
// Serve os arquivos ZIP de atualização
app.use("/updates", express.static(path.join(__dirname, "updates")));

// Endpoint para o App verificar se tem novidade
app.get("/check-update", (req, res) => {
  const currentVersion = "2.0.26"; // Versão ATUAL DO SERVIDOR
  const baseUrl = process.env.BASE_URL || "https://academy.fortfruit.com.br";

  res.json({
    version: currentVersion,
    url: `${baseUrl}/updates/v${currentVersion}.zip`, // URL dinâmica do ZIP
    note: "Sistema em produção.",
  });
});

// =================== SETUP INICIAL DO USUÁRIO TESTE ===================
// Cria as 4 entregas de teste copiando linhas reais do banco
app.post("/setup-test-data", async (req, res) => {
  const TEST_MOTORISTA = "TESTE";

  try {
    // Verifica se já existem entregas de teste
    const [existing] = await db
      .promise()
      .query(`SELECT COUNT(*) AS total FROM entregas WHERE ZH_MOTOR = ?`, [
        TEST_MOTORISTA,
      ]);
    if (existing[0].total >= 4) {
      return res.json({
        success: true,
        message: "Entregas de teste já existem.",
      });
    }

    // Copia 4 linhas reais e sobrescreve apenas os campos necessários
    const [rows] = await db
      .promise()
      .query(`SELECT * FROM entregas WHERE ZH_MOTOR != ? LIMIT 4`, [
        TEST_MOTORISTA,
      ]);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Nenhuma entrega real encontrada para copiar." });
    }

    const clientes = [
      "CLIENTE TESTE 1",
      "CLIENTE TESTE 2",
      "CLIENTE TESTE 3",
      "CLIENTE TESTE 4",
    ];
    const enderecos = [
      "RUA DAS FLORES, 100",
      "AV. BRASIL, 250",
      "RUA SAO PAULO, 380",
      "TRAVESSA RIO, 90",
    ];

    for (let i = 0; i < Math.min(4, rows.length); i++) {
      const row = { ...rows[i] };
      delete row.id; // auto-increment
      row.ZH_CODIGO = 99999;
      row.ZH_MOTOR = TEST_MOTORISTA;
      row.ZH_NOME = "ROTA TESTE";
      row.ZH_NOMMOT = "Motorista Teste";
      row.ZB_DTENTRE = new Date().toISOString().split("T")[0];
      row.ZB_NOMCLI = clientes[i];
      row.ZB_END = enderecos[i];
      row.ZB_NUMSEQ = `TEST0${i + 1}`;
      row.ZH_STATUS = "PENDENTE";
      row.ZH_FOTO_URL = null;
      row.chegada_em = null;

      await db.promise().query("INSERT INTO entregas SET ?", [row]);
    }

    res.json({
      success: true,
      message: "4 entregas de teste criadas com sucesso!",
    });
  } catch (err) {
    console.error("Erro ao criar dados de teste:", err);
    res.status(500).json({ error: err.message });
  }
});

// =================== RESET DADOS DE TESTE ===================
app.post("/reset-test-data", async (req, res) => {
  const TEST_MOTORISTA = "TESTE";

  try {
    // 1. Reseta entregas: volta para pendente e atualiza data para hoje
    await db.promise().query(
      `UPDATE entregas
       SET ZH_STATUS = 'PENDENTE', ZH_FOTO_URL = NULL, chegada_em = NULL, ZB_DTENTRE = CURDATE()
       WHERE ZH_MOTOR = ?`,
      [TEST_MOTORISTA],
    );

    // 2. Remove registros de jornada de hoje
    await db.promise().query(
      `DELETE FROM rota_logs
       WHERE motorista = ?
         AND (DATE(created_at) = CURDATE() OR DATE(data_hora) = CURDATE() OR DATE(dataHora) = CURDATE())`,
      [TEST_MOTORISTA],
    );

    // 3. Remove paradas de hoje
    await db.promise().query(
      `DELETE FROM daily_logs
       WHERE motorista_id = ? AND data = CURDATE()`,
      [TEST_MOTORISTA],
    );

    // 4. Remove checklist de hoje
    await db.promise().query(
      `DELETE FROM checklist_diario
       WHERE motorista_id = ? AND DATE(created_at) = CURDATE()`,
      [TEST_MOTORISTA],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Erro ao resetar dados de teste:", err);
    res.status(500).json({ error: "Erro ao resetar dados de teste" });
  }
});

// =================== CONTROLE DIÁRIO (PARADAS) ===================

// GET: Busca paradas do dia para um motorista
app.get("/daily_logs/:motorista_id", (req, res) => {
  const { motorista_id } = req.params;
  const sql = `
    SELECT id, local, status, 
           TIME_FORMAT(hora_inicio, '%H:%i') as hora_inicio, 
           TIME_FORMAT(hora_fim, '%H:%i') as hora_fim, 
           foto_url, data
    FROM daily_logs
    WHERE motorista_id = ? AND data = CURDATE()
    ORDER BY id DESC
  `;
  db.query(sql, [motorista_id], (err, results) => {
    if (err) {
      console.error("Erro /daily_logs (GET):", err);
      return res.status(500).json({ error: "Erro ao buscar paradas" });
    }
    res.json(results);
  });
});

// POST: Inicia uma nova parada
app.post("/daily_logs", (req, res) => {
  const { motorista_id, route_id, local } = req.body;
  if (!motorista_id || !local) {
    return res
      .status(400)
      .json({ error: "motorista_id e local são obrigatórios" });
  }

  const sql = `
    INSERT INTO daily_logs (motorista_id, route_id, local, status, hora_inicio, data)
    VALUES (?, ?, ?, 'pendente', CURTIME(), CURDATE())
  `;
  db.query(sql, [motorista_id, route_id || null, local], (err, result) => {
    if (err) {
      console.error("Erro /daily_logs (POST):", err);
      return res.status(500).json({ error: "Erro ao salvar parada" });
    }
    res.json({ success: true, id: result.insertId });
  });
});

// PUT: Finaliza uma parada
app.put("/daily_logs/:id", (req, res) => {
  const { id } = req.params;
  const { foto_url, hora_fim } = req.body;

  // hora_fim pode vir do app quando a foto foi tirada offline (preserva horário real)
  // Se não vier, usa o horário atual do servidor
  const sql = hora_fim
    ? `UPDATE daily_logs SET status = 'concluido', hora_fim = ?, foto_url = ? WHERE id = ?`
    : `UPDATE daily_logs SET status = 'concluido', hora_fim = CURTIME(), foto_url = ? WHERE id = ?`;

  const params = hora_fim
    ? [hora_fim, foto_url || null, id]
    : [foto_url || null, id];

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("Erro /daily_logs (PUT):", err);
      return res.status(500).json({ error: "Erro ao finalizar parada" });
    }
    res.json({ success: true });
  });
});

// =================== ESTATÍSTICAS MENSAIS (Resumo) ===================
app.get("/driver/monthly-stats/:codMotorista", (req, res) => {
  const { codMotorista } = req.params;

  // Busca estatísticas do mês atual
  const sql = `
    SELECT 
      COUNT(*) as total,
      SUM(CASE 
        WHEN ZH_STATUS IN ('CONCLUIDA', 'FINALIZADO') THEN 1 
        ELSE 0 
      END) as completas,
      SUM(CASE 
        WHEN ZH_STATUS NOT IN ('CONCLUIDA', 'FINALIZADO', 'PENDENTE') THEN 1 
        ELSE 0 
      END) as problemas
    FROM entregas
    WHERE ZH_MOTOR = ?
      AND MONTH(ZB_DTENTRE) = MONTH(CURDATE())
      AND YEAR(ZB_DTENTRE) = YEAR(CURDATE())
  `;

  db.query(sql, [codMotorista], (err, results) => {
    if (err) {
      console.error("Erro /driver/monthly-stats:", err);
      // Retorna zerado em caso de erro para não quebrar o front
      return res.json({ total: 0, completas: 0, problemas: 0 });
    }

    const { total, completas, problemas } = results[0];

    // Calcula parciais baseado (Total - Completas - Pendentes?)
    // Por enquanto simplificado conforme query acima

    res.json({
      total: total || 0,
      completas: completas || 0,
      problemas: problemas || 0,
      // motivos: null (conforme pedido)
    });
  });
});

// =================== PERFORMANCE DO MOTORISTA ===================
app.get("/driver/performance/:codMotorista", (req, res) => {
  const { codMotorista } = req.params;

  if (!dbOcorrencias) {
    return res.status(500).json({
      error: "Conexão com banco de ocorrências não disponível",
    });
  }

  // 1. Busca o nome do motorista para fazer a busca nas ocorrências
  const queryName = `
    SELECT nome_motorista
    FROM login
    WHERE ZH_MOTOR = ?
  `;

  db.query(queryName, [codMotorista], (err, results) => {
    if (err || !results.length) {
      return res.status(404).json({ error: "Motorista não encontrado" });
    }

    const driverName = results[0].nome_motorista;

    // 2. Busca estatísticas de entregas do mês atual
    const sqlEntregas = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN ZH_STATUS IN ('CONCLUIDA', 'FINALIZADO') THEN 1 ELSE 0 END) as completas
      FROM entregas
      WHERE ZH_MOTOR = ?
        AND YEAR(ZB_DTENTRE) = YEAR(CURDATE())
        AND MONTH(ZB_DTENTRE) = MONTH(CURDATE())
    `;

    db.query(sqlEntregas, [codMotorista], (errEntregas, resultsEntregas) => {
      if (errEntregas) {
        console.error("Erro ao buscar entregas:", errEntregas);
        return res.status(500).json({ error: "Erro ao buscar entregas" });
      }

      const totalEntregas = resultsEntregas[0]?.total || 0;
      const completas = resultsEntregas[0]?.completas || 0;

      // 3. Busca erros do motorista no mês atual (filtrado por "ERRO DO MOTORISTA" ou descrição similar)
      const sqlErros = `
        SELECT 
          COUNT(*) as total_erros,
          SUM(CASE WHEN status = 'PENDENTE' THEN 1 ELSE 0 END) as erros_pendentes,
          SUM(CASE WHEN status = 'RESOLVIDO' THEN 1 ELSE 0 END) as erros_resolvidos,
          SUM(CASE WHEN status = 'INFORMATIVO' THEN 1 ELSE 0 END) as erros_informativos,
          SUM(valor) as valor_total_erros
        FROM ocorrencias
        WHERE motorista = ?
          AND YEAR(data) = YEAR(CURDATE())
          AND MONTH(data) = MONTH(CURDATE())
          AND (
            descricao LIKE '%ERRO DO MOTORISTA%' 
            OR descricao LIKE '%ERRO MOTORISTA%'
            OR acao LIKE '%ERRO%'
            OR descricao LIKE '%FALHA%'
          )
          AND (D_E_L_E_T_ IS NULL OR D_E_L_E_T_ = '')
      `;

      dbOcorrencias.query(sqlErros, [driverName], (errErros, resultsErros) => {
        if (errErros) {
          console.error("Erro ao buscar erros:", errErros);
          return res
            .status(500)
            .json({ error: "Erro ao buscar erros do motorista" });
        }

        const erros = resultsErros[0] || {};
        const totalErros = erros.total_erros || 0;
        const errosPendentes = erros.erros_pendentes || 0;
        const errosResolvidos = erros.erros_resolvidos || 0;
        const errosInformativos = erros.erros_informativos || 0;
        const valorTotalErros = parseFloat(erros.valor_total_erros) || 0;

        // 4. Busca erros do mês anterior para comparação
        const sqlErrosMesAnterior = `
          SELECT COUNT(*) as total_erros
          FROM ocorrencias
          WHERE motorista = ?
            AND YEAR(data) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
            AND MONTH(data) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
            AND (
              descricao LIKE '%ERRO DO MOTORISTA%' 
              OR descricao LIKE '%ERRO MOTORISTA%'
              OR acao LIKE '%ERRO%'
              OR descricao LIKE '%FALHA%'
            )
            AND (D_E_L_E_T_ IS NULL OR D_E_L_E_T_ = '')
        `;

        dbOcorrencias.query(
          sqlErrosMesAnterior,
          [driverName],
          (errAnterior, resultsAnterior) => {
            const errosMesAnterior = resultsAnterior[0]?.total_erros || 0;
            const variacao =
              errosMesAnterior > 0
                ? (
                    ((totalErros - errosMesAnterior) / errosMesAnterior) *
                    100
                  ).toFixed(1)
                : totalErros > 0
                  ? "100.0"
                  : "0.0";

            // 5. Calcula taxa de erro
            const taxaErro =
              totalEntregas > 0
                ? ((totalErros / totalEntregas) * 100).toFixed(2)
                : "0.00";

            // 6. Taxa de sucesso
            const taxaSucesso =
              totalEntregas > 0
                ? ((completas / totalEntregas) * 100).toFixed(2)
                : "0.00";

            res.json({
              motorista: driverName,
              periodo: {
                mes: new Date().toLocaleString("pt-BR", {
                  month: "long",
                  year: "numeric",
                }),
                mesAnterior: new Date(
                  new Date().setMonth(new Date().getMonth() - 1),
                ).toLocaleString("pt-BR", { month: "long", year: "numeric" }),
              },
              entregas: {
                total: totalEntregas,
                completas: completas,
                taxaSucesso: parseFloat(taxaSucesso),
              },
              erros: {
                total: totalErros,
                pendentes: errosPendentes,
                resolvidos: errosResolvidos,
                informativos: errosInformativos,
                valorTotal: valorTotalErros,
                taxaErro: parseFloat(taxaErro),
                variacao: parseFloat(variacao),
                mesAnterior: errosMesAnterior,
              },
              performance: {
                score:
                  totalEntregas > 0
                    ? Math.max(
                        0,
                        Math.min(100, 100 - (totalErros / totalEntregas) * 100),
                      )
                    : 100,
                nivel:
                  totalErros === 0
                    ? "EXCELENTE"
                    : parseFloat(taxaErro) < 5
                      ? "BOM"
                      : parseFloat(taxaErro) < 10
                        ? "REGULAR"
                        : "ATENÇÃO",
              },
            });
          },
        );
      });
    });
  });
});

// =================== MONITORAMENTO DE TRÂNSITO (TomTom) ===================

// Cache em memória para evitar chamadas excessivas (Limite gratuito)
let trafficCache = {
  data: [],
  lastUpdated: 0,
};
const TRAFFIC_CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Helper para traduzir códigos de categoria
function getTrafficCategoryName(categoryCode) {
  const categories = {
    0: "Desconhecido",
    1: "Acidente",
    2: "Neblina",
    3: "Condições Perigosas",
    4: "Chuva",
    5: "Gelo",
    6: "Interdição",
    7: "Interdição de Faixa",
    8: "Outros",
    9: "Obras",
    10: "Vento",
    11: "Enchente",
    12: "Veículo Quebrado",
    13: "Engarrafamento",
    14: "Caminhão Quebrado",
  };
  return categories[categoryCode] || "Incidente";
}

app.get("/traffic-alerts", async (req, res) => {
  try {
    const now = Date.now();

    // 1. Verifica Cache
    if (
      trafficCache.data.length > 0 &&
      now - trafficCache.lastUpdated < TRAFFIC_CACHE_DURATION
    ) {
      console.log("🚗 [CACHE] Retornando dados de trânsito locais.");
      return res.json(trafficCache.data);
    }

    // 2. Validação da Chave
    if (!TOMTOM_API_KEY || TOMTOM_API_KEY === "SUA_API_KEY_AQUI") {
      console.warn(
        "⚠️ [TOMTOM] API Key não configurada. Configure no topo do server.js ou .env",
      );
      // Retorna array vazio para não quebrar o front
      return res.json([]);
    }

    // 3. Busca na API TomTom (VERSÃO 5 - QUERY PARAMS)
    const fields =
      "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description},startTime,endTime,from,to,length,delay,roadNumbers}}}";
    // Nota: Language removido pois pt-BR não era suportado, descrições virão em inglês (Traffic API v5)
    // Categoria é traduzida pelo nosso helper.
    const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${TOMTOM_API_KEY}&bbox=${TOMTOM_BBOX}&fields=${fields}`;

    console.log("🔄 [TOMTOM] Buscando novos dados de trânsito (v5)...");
    const response = await fetch(url);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Erro TomTom API: ${response.status} - ${errText}`);
      throw new Error(`Erro na API de Trânsito: ${response.status}`);
    }

    const data = await response.json();

    // Helper para traduzir descrições comuns (Inglês -> Português)
    const translateDescription = (desc) => {
      if (!desc) return "Sem descrição";
      const d = desc.toLowerCase();
      if (d.includes("stationary traffic")) return "Trânsito parado";
      if (d.includes("queuing traffic")) return "Trânsito lento / Fila";
      if (d.includes("slow traffic")) return "Trânsito lento";
      if (d.includes("closed")) return "Fechado / Interditado";
      if (d.includes("roadworks")) return "Obras na pista";
      if (d.includes("accident")) return "Acidente";
      if (d.includes("lane closed")) return "Faixa bloqueada";
      return desc; // Retorna original se não tiver tradução mapeada
    };

    // 4. Processa os dados (Estrutura V5)
    const incidents = data.incidents || [];
    const formattedAlerts = incidents.map((inc, idx) => {
      const props = inc.properties || {};
      const events = props.events || [];
      const originalDesc =
        events.length > 0 ? events[0].description : "Sem descrição";

      return {
        id: props.id || `inc-${idx}`,
        type: getTrafficCategoryName(props.iconCategory),
        location:
          props.from && props.to
            ? `${props.from} ➝ ${props.to}`
            : props.from || props.to || "Local não especificado",
        description: translateDescription(originalDesc),
        delay: props.magnitudeOfDelay || 0,
        rawCategory: props.iconCategory,
      };
    });

    // 5. Atualiza Cache
    trafficCache = {
      data: formattedAlerts,
      lastUpdated: now,
    };

    console.log(
      `✅ [TOMTOM] Sucesso: ${formattedAlerts.length} alertas encontrados.`,
    );
    res.json(formattedAlerts);
  } catch (error) {
    console.error("Erro no endpoint /traffic-alerts:", error);
    // Em caso de erro, tenta retornar o cache antigo se existir
    if (trafficCache.data.length > 0) {
      console.log("⚠️ [RESCUE] Retornando cache antigo devido a erro na API.");
      return res.json(trafficCache.data);
    }
    res
      .status(500)
      .json({ error: "Não foi possível carregar os dados de trânsito." });
  }
});

// =================== CHECKLIST ===================
// Verifica se o motorista já fez o checklist hoje
app.get("/checklist/status/:motorista", (req, res) => {
  const { motorista } = req.params;
  const sql = `
    SELECT id, created_at 
    FROM checklist_diario 
    WHERE motorista_id = ? 
      AND DATE(created_at) = CURDATE()
    LIMIT 1
  `;

  db.query(sql, [motorista], (err, results) => {
    if (err) {
      console.error("Erro ao verificar status do checklist:", err);
      return res.status(500).json({ error: "Erro interno" });
    }

    if (results.length > 0) {
      res.json({
        done: true,
        checklistId: results[0].id,
        date: results[0].created_at,
      });
    } else {
      res.json({ done: false });
    }
  });
});

// Busca pendências e ocorrências extras não resolvidas
app.get("/checklist/pending/:placa", async (req, res) => {
  const { placa } = req.params;

  const sqlRespostas = `
    SELECT 
      cr.id, 
      cr.checklist_id, 
      cr.pergunta_id, 
      cr.categoria, 
      cr.pergunta_texto, 
      cr.observacao, 
      cr.status,
      cr.resolvido,
      cd.created_at,
      l.nome_motorista
    FROM checklist_respostas cr
    JOIN checklist_diario cd ON cr.checklist_id = cd.id
    LEFT JOIN login l ON cd.motorista_id = l.ZH_MOTOR
    WHERE cd.veiculo_placa = ? 
      AND cr.status = 'PROBLEM' 
      AND (cr.resolvido = 0 OR cr.resolvido IS NULL)
    ORDER BY cd.created_at DESC
  `;

  const sqlOcorrencias = `
    SELECT 
      co.id,
      co.checklist_id,
      'EXTRA' as pergunta_id, 
      'OCORRÊNCIA EXTRA' as categoria, 
      'Problema Relatado' as pergunta_texto, 
      co.observacao, 
      'PROBLEM' as status,
      co.foto_url,
      co.resolvido,
      cd.created_at,
      l.nome_motorista
    FROM checklist_ocorrencias co
    JOIN checklist_diario cd ON co.checklist_id = cd.id
    LEFT JOIN login l ON cd.motorista_id = l.ZH_MOTOR
    WHERE cd.veiculo_placa = ? 
      AND (co.resolvido = 0 OR co.resolvido IS NULL)
    ORDER BY cd.created_at DESC
  `;

  try {
    const [respostas] = await db.promise().query(sqlRespostas, [placa]);
    const [ocorrencias] = await db.promise().query(sqlOcorrencias, [placa]);

    // Deduplicar respostas por pergunta_id (mantendo a mais recente)
    const uniqueRespostas = [];
    const seenQuestionIds = new Set();

    for (const r of respostas) {
      if (!seenQuestionIds.has(r.pergunta_id)) {
        seenQuestionIds.add(r.pergunta_id);
        uniqueRespostas.push(r);
      }
    }

    // Combinar resultados
    const allIssues = [...uniqueRespostas, ...ocorrencias];

    // Ordenar por data (mais recente primeiro)
    allIssues.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(allIssues);
  } catch (err) {
    console.error("Erro ao buscar pendências:", err);
    res.json([]);
  }
});

app.post("/checklist", async (req, res) => {
  const { motorista, veiculo, respostas, ocorrencias } = req.body;

  if (!motorista || !veiculo) {
    return res
      .status(400)
      .json({ error: "Motorista e veículo são obrigatórios" });
  }

  // Usando transação via connection do pool
  db.getConnection(async (err, conn) => {
    if (err) {
      console.error("Erro ao obter conexão:", err);
      return res.status(500).json({ error: "Erro no servidor" });
    }

    try {
      await conn.promise().beginTransaction();

      // 1. Salvar Cabeçalho
      const [resultHeader] = await conn
        .promise()
        .query(
          `INSERT INTO checklist_diario (motorista_id, veiculo_placa) VALUES (?, ?)`,
          [motorista, veiculo],
        );
      const checklistId = resultHeader.insertId;

      // 2. Salvar Respostas
      if (respostas && respostas.length > 0) {
        const valuesRespostas = respostas.map((r) => [
          checklistId,
          r.id,
          r.category || "",
          r.text || r.question || "", // Frontend manda 'text', mas garantimos compatibilidade
          r.status,
          r.obs || null,
        ]);

        await conn
          .promise()
          .query(
            `INSERT INTO checklist_respostas (checklist_id, pergunta_id, categoria, pergunta_texto, status, observacao) VALUES ?`,
            [valuesRespostas],
          );
      }

      // 3. Salvar Ocorrências Extras
      if (ocorrencias && ocorrencias.length > 0) {
        const valuesOcorrencias = ocorrencias.map((o) => [
          checklistId,
          o.photoUrl, // Aqui esperamos a URL já do Supabase, que o front deve mandar
          o.observation,
        ]);

        await conn
          .promise()
          .query(
            `INSERT INTO checklist_ocorrencias (checklist_id, foto_url, observacao) VALUES ?`,
            [valuesOcorrencias],
          );
      }

      await conn.promise().commit();
      console.log(`✅ Checklist salvo com sucesso! ID: ${checklistId}`);
      res.json({ success: true, id: checklistId });
    } catch (error) {
      console.error("Erro ao salvar checklist:", error);
      await conn.promise().rollback();
      res.status(500).json({ error: "Erro ao salvar checklist no banco" });
    } finally {
      conn.release();
    }
  });
});

// Endpoint para admin listar todos os motoristas
app.get("/motoristas", (req, res) => {
  const sql = `
    SELECT id, ZH_MOTOR AS motorista_id, nome_motorista 
    FROM login 
    WHERE ZH_MOTOR IS NOT NULL AND ZH_MOTOR != ''
    ORDER BY nome_motorista ASC
  `;
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Erro ao buscar motoristas:", err);
      return res.status(500).json({ error: "Erro ao buscar motoristas" });
    }
    res.json(results);
  });
});

// Endpoint para admin pesquisar bilhete em todos os motoristas
app.get("/pesquisar-bilhete", (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);

  const search = `%${q}%`;
  const sql = `
    SELECT 
      ZB_NUMSEQ, ZB_NOMCLI, ZB_END, ZB_BAIRRO, ZB_NOTA, 
      ZH_STATUS, ZH_FOTO_URL, ZB_DTENTRE, ZH_MOTOR, ZH_NOMMOT
    FROM entregas
    WHERE ZB_NUMSEQ LIKE ? 
       OR ZB_NOTA LIKE ? 
       OR ZB_NOMCLI LIKE ?
    ORDER BY ZB_DTENTRE DESC
    LIMIT 50
  `;

  db.query(sql, [search, search, search], (err, results) => {
    if (err) {
      console.error("Erro /pesquisar-bilhete:", err);
      return res.status(500).json({ error: "Erro na pesquisa" });
    }
    res.json(results);
  });
});

// =================== SERVIR FRONTEND (SEMPRE) ===================
const distPath = path.join(__dirname, "dist");

const indexPath = path.join(distPath, "index.html");

// Verifica se a pasta dist existe
if (!fs.existsSync(distPath)) {
  console.error("❌ ERRO: Pasta 'dist' não encontrada!");
  console.error("   Execute 'npm run build' antes de iniciar o servidor.");
  process.exit(1);
}

if (!fs.existsSync(indexPath)) {
  console.error("❌ ERRO: Arquivo 'dist/index.html' não encontrado!");
  console.error("   Execute 'npm run build' antes de iniciar o servidor.");
  process.exit(1);
}

console.log("✅ Pasta 'dist' encontrada. Servindo arquivos estáticos...");

// Diz para o Express usar a pasta 'dist' para arquivos estáticos (CSS, JS, Imagens)
app.use(
  express.static(distPath, {
    maxAge: process.env.NODE_ENV === "production" ? "1y" : "0", // Cache em produção
    etag: true,
  }),
);

// Middleware catch-all para SPA: serve index.html para rotas não encontradas
// IMPORTANTE: Este middleware deve ser o ÚLTIMO, após todas as rotas de API
app.use((req, res, next) => {
  // Ignora requisições que não são GET ou que já foram processadas
  if (req.method !== "GET") {
    return next();
  }

  // Ignora arquivos estáticos (JS, CSS, imagens, etc.) - já foram servidos pelo express.static
  if (
    req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i)
  ) {
    return next();
  }

  // Serve o index.html para permitir roteamento do SPA
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error("❌ Erro ao servir index.html:", err);
      res.status(500).send("Erro ao carregar a aplicação");
    }
  });
});

// =================== INICIAR SERVIDOR ===================
const HOST = "0.0.0.0"; // Escuta em todas as interfaces (necessário para produção)

app
  .listen(PORT, HOST, () => {
    console.log(`🚀 Servidor rodando em http://${HOST}:${PORT}`);
    console.log(`📁 Servindo arquivos de: ${distPath}`);
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV || "development"}`);
    console.log(`🌐 URL de produção: https://academy.fortfruit.com.br`);
    console.log(`✅ Pronto para receber requisições!`);

    // Aviso se não estiver em produção
    if (process.env.NODE_ENV !== "production") {
      console.warn("⚠️  ATENÇÃO: NODE_ENV não está definido como 'production'");
      console.warn("   Para produção, defina: export NODE_ENV=production");
    }
  })
  .on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`❌ ERRO: Porta ${PORT} já está em uso!`);
      console.error(
        `   Feche o processo que está usando a porta ${PORT} ou mude a porta no .env`,
      );
    } else {
      console.error("❌ ERRO ao iniciar servidor:", err);
    }
    process.exit(1);
  });
