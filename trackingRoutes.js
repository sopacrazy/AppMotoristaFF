import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const RETENTION_MS = 2 * 24 * 60 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{64}$/i;
const MAX_BATCH = 100;

const toSqlUtc = (date) => date.toISOString().slice(0, 23).replace("T", " ");

export async function issueTrackingToken(db, motorista) {
  if (!motorista || String(motorista).length > 64) return null;
  const token = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(token).digest();
  await db.promise().query(
    `INSERT INTO tracking_tokens (token_hash, motorista, created_at, expires_at)
     VALUES (?, ?, UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 DAY))`,
    [hash, String(motorista)],
  );
  return token;
}

function parsePoint(raw) {
  if (!raw || typeof raw !== "object") return null;
  const { pointId, sessionId, routeCode, capturedAt } = raw;
  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  const accuracy = raw.accuracy == null ? null : Number(raw.accuracy);
  const speed = raw.speed == null ? null : Number(raw.speed);
  const heading = raw.heading == null ? null : Number(raw.heading);
  const captured = new Date(capturedAt);
  const now = Date.now();
  if (!UUID_RE.test(pointId) || !UUID_RE.test(sessionId)) return null;
  if (!Number.isFinite(captured.getTime()) || captured.getTime() < now - RETENTION_MS || captured.getTime() > now + 5 * 60_000) return null;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 10_000)) return null;
  if (speed != null && (!Number.isFinite(speed) || speed < 0 || speed > 100)) return null;
  if (heading != null && (!Number.isFinite(heading) || heading < 0 || heading > 360)) return null;
  if (routeCode != null && (typeof routeCode !== "string" || routeCode.length > 64)) return null;
  return { pointId, sessionId, routeCode: routeCode || null, capturedAt: toSqlUtc(captured), latitude, longitude, accuracy, speed, heading };
}

export function createDriverTokenAuth(db) {
  return async (req, res, next) => {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!TOKEN_RE.test(token)) return res.status(401).json({ error: "Token de rastreio inválido" });
    try {
      const hash = createHash("sha256").update(token).digest();
      const [rows] = await db.promise().query(
        `SELECT motorista FROM tracking_tokens WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP(3) LIMIT 1`,
        [hash],
      );
      if (!rows.length) return res.status(401).json({ error: "Token de rastreio expirado" });
      req.trackingMotorista = rows[0].motorista;
      await db.promise().query(
        `UPDATE tracking_tokens SET expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 DAY) WHERE token_hash = ?`,
        [hash],
      );
      next();
    } catch (error) {
      console.error("Erro de autenticação do rastreio:", error);
      res.status(503).json({ error: "Rastreio indisponível" });
    }
  };
}

function readAuth(req, res, next) {
  const configured = process.env.TRACKING_READ_KEY;
  if (!configured || configured.length < 32) return res.status(503).json({ error: "TRACKING_READ_KEY não configurada" });
  const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expectedHash = createHash("sha256").update(configured).digest();
  const actualHash = createHash("sha256").update(supplied).digest();
  if (!timingSafeEqual(expectedHash, actualHash)) return res.status(401).json({ error: "Não autorizado" });
  next();
}

export function registerTrackingRoutes(app, db) {
  const authenticateDriver = createDriverTokenAuth(db);

  app.post("/tracking/positions", authenticateDriver, async (req, res) => {
    const rawPoints = req.body?.points;
    if (!Array.isArray(rawPoints) || rawPoints.length < 1 || rawPoints.length > MAX_BATCH) {
      return res.status(400).json({ error: `Envie entre 1 e ${MAX_BATCH} pontos` });
    }
    const points = rawPoints.map(parsePoint);
    if (points.some((point) => !point)) return res.status(400).json({ error: "Ponto de GPS inválido ou fora do prazo de dois dias" });
    const motorista = req.trackingMotorista;
    const newest = points.reduce((a, b) => a.capturedAt > b.capturedAt ? a : b);
    const connection = await db.promise().getConnection();
    try {
      await connection.beginTransaction();
      for (const point of points) {
        await connection.query(
          `INSERT IGNORE INTO tracking_positions
           (point_id, session_id, motorista, codigo_rota, captured_at, received_at, latitude, longitude, accuracy_m, speed_mps, heading_degrees)
           VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3), ?, ?, ?, ?, ?)`,
          [point.pointId, point.sessionId, motorista, point.routeCode, point.capturedAt, point.latitude, point.longitude, point.accuracy, point.speed, point.heading],
        );
      }
      await connection.query(
        `INSERT INTO tracking_latest
         (motorista, session_id, codigo_rota, captured_at, received_at, latitude, longitude, accuracy_m, speed_mps, heading_degrees, active)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3), ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           active = IF(VALUES(captured_at) > captured_at AND (stopped_at IS NULL OR VALUES(captured_at) > stopped_at), 1, active),
           session_id = IF(VALUES(captured_at) > captured_at, VALUES(session_id), session_id),
           codigo_rota = IF(VALUES(captured_at) > captured_at, VALUES(codigo_rota), codigo_rota),
           received_at = IF(VALUES(captured_at) > captured_at, VALUES(received_at), received_at),
           latitude = IF(VALUES(captured_at) > captured_at, VALUES(latitude), latitude),
           longitude = IF(VALUES(captured_at) > captured_at, VALUES(longitude), longitude),
           accuracy_m = IF(VALUES(captured_at) > captured_at, VALUES(accuracy_m), accuracy_m),
           speed_mps = IF(VALUES(captured_at) > captured_at, VALUES(speed_mps), speed_mps),
           heading_degrees = IF(VALUES(captured_at) > captured_at, VALUES(heading_degrees), heading_degrees),
           captured_at = GREATEST(captured_at, VALUES(captured_at))`,
        [motorista, newest.sessionId, newest.routeCode, newest.capturedAt, newest.latitude, newest.longitude, newest.accuracy, newest.speed, newest.heading],
      );
      await connection.commit();
      res.json({ success: true, accepted: points.length });
    } catch (error) {
      await connection.rollback();
      console.error("Erro ao salvar posições:", error);
      res.status(500).json({ error: "Erro ao salvar posições" });
    } finally {
      connection.release();
    }
  });

  app.post("/tracking/stop", authenticateDriver, async (req, res) => {
    const { sessionId, stoppedAt } = req.body || {};
    const stopped = new Date(stoppedAt);
    if (!UUID_RE.test(sessionId) || !Number.isFinite(stopped.getTime()) || stopped.getTime() < Date.now() - RETENTION_MS || stopped.getTime() > Date.now() + 5 * 60_000) {
      return res.status(400).json({ error: "Encerramento inválido" });
    }
    try {
      await db.promise().query(
        `UPDATE tracking_latest SET active = 0, stopped_at = ? WHERE motorista = ? AND session_id = ? AND (stopped_at IS NULL OR stopped_at < ?)`,
        [toSqlUtc(stopped), req.trackingMotorista, sessionId, toSqlUtc(stopped)],
      );
      res.json({ success: true });
    } catch (error) {
      console.error("Erro ao encerrar rastreio:", error);
      res.status(500).json({ error: "Erro ao encerrar rastreio" });
    }
  });

  app.get("/tracking/latest", readAuth, async (_req, res) => {
    try {
      const [rows] = await db.promise().query(
        `SELECT motorista, codigo_rota AS routeCode, latitude, longitude, accuracy_m AS accuracy,
                speed_mps AS speed, heading_degrees AS heading,
                DATE_FORMAT(captured_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS capturedAt,
                DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS receivedAt,
                (active = 1 AND captured_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 3 MINUTE)) AS online
         FROM tracking_latest WHERE captured_at >= DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 2 DAY)`,
      );
      res.json(rows);
    } catch (error) {
      console.error("Erro ao consultar rastreio:", error);
      res.status(500).json({ error: "Erro ao consultar rastreio" });
    }
  });

  app.get("/tracking/history/:motorista", readAuth, async (req, res) => {
    const from = new Date(String(req.query.from || ""));
    const to = new Date(String(req.query.to || ""));
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to || from.getTime() < Date.now() - RETENTION_MS || to.getTime() > Date.now() + 5 * 60_000) {
      return res.status(400).json({ error: "Informe from e to dentro dos últimos dois dias" });
    }
    try {
      const [rows] = await db.promise().query(
        `SELECT point_id AS pointId, session_id AS sessionId, codigo_rota AS routeCode,
                latitude, longitude, accuracy_m AS accuracy, speed_mps AS speed,
                heading_degrees AS heading,
                DATE_FORMAT(captured_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS capturedAt,
                DATE_FORMAT(received_at, '%Y-%m-%dT%H:%i:%s.%fZ') AS receivedAt
         FROM tracking_positions WHERE motorista = ? AND captured_at BETWEEN ? AND ?
         ORDER BY captured_at ASC LIMIT 5000`,
        [req.params.motorista, toSqlUtc(from), toSqlUtc(to)],
      );
      res.json(rows);
    } catch (error) {
      console.error("Erro ao consultar histórico de rastreio:", error);
      res.status(500).json({ error: "Erro ao consultar histórico" });
    }
  });

  const cleanup = async () => {
    try {
      let removed;
      do {
        const [result] = await db.promise().query(
          `DELETE FROM tracking_positions WHERE captured_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 2 DAY) LIMIT 10000`,
        );
        removed = result.affectedRows;
      } while (removed === 10000);
      await db.promise().query(`DELETE FROM tracking_latest WHERE captured_at < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 2 DAY)`);
      await db.promise().query(`DELETE FROM tracking_tokens WHERE expires_at < UTC_TIMESTAMP(3)`);
    } catch (error) {
      console.warn("Limpeza do histórico de rastreio falhou:", error.message);
    }
  };
  const timer = setInterval(cleanup, 60 * 60 * 1000);
  timer.unref?.();
  cleanup();
}
