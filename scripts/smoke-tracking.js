import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import mysql from "mysql2";
import { issueTrackingToken } from "../trackingRoutes.js";

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 2,
});
const baseUrl = process.env.TRACKING_SMOKE_URL || `http://127.0.0.1:${process.env.PORT || 4010}`;
const motorista = `SMOKE_${randomUUID().slice(0, 8)}`;
let token;

try {
  token = await issueTrackingToken(db, motorista);
  const sessionId = randomUUID();
  const point = {
    pointId: randomUUID(), sessionId, routeCode: "SMOKE_TEST",
    capturedAt: new Date().toISOString(), latitude: -1.4558, longitude: -48.4902,
    accuracy: 12,
  };
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const send = () => fetch(`${baseUrl}/tracking/positions`, { method: "POST", headers, body: JSON.stringify({ points: [point] }) });
  assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 200);

  const [[count]] = await db.promise().query(`SELECT COUNT(*) AS total FROM tracking_positions WHERE motorista = ?`, [motorista]);
  assert.equal(count.total, 1, "a repetição do ponto deve ser ignorada");

  const stop = await fetch(`${baseUrl}/tracking/stop`, {
    method: "POST", headers,
    body: JSON.stringify({ sessionId, stoppedAt: new Date().toISOString() }),
  });
  assert.equal(stop.status, 200);
  const [[latest]] = await db.promise().query(`SELECT active FROM tracking_latest WHERE motorista = ?`, [motorista]);
  assert.equal(latest.active, 0, "a rota encerrada não deve continuar ativa");
  console.log("Rastreio: envio, deduplicação e encerramento verificados.");
} finally {
  await db.promise().query(`DELETE FROM tracking_latest WHERE motorista = ?`, [motorista]);
  await db.promise().query(`DELETE FROM tracking_positions WHERE motorista = ?`, [motorista]);
  if (token) {
    const hash = createHash("sha256").update(token).digest();
    await db.promise().query(`DELETE FROM tracking_tokens WHERE token_hash = ?`, [hash]);
  }
  await db.promise().end();
}
