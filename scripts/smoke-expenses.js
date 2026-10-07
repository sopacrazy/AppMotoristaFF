import "dotenv/config";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import express from "express";
import mysql from "mysql2";
import { issueTrackingToken } from "../trackingRoutes.js";
import { registerExpenseRoutes } from "../expenseRoutes.js";

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 2,
});
const externalBase = process.env.EXPENSE_SMOKE_URL?.replace(/\/$/, "");
let server = null;
if (!externalBase) {
  const app = express();
  app.use(express.json());
  registerExpenseRoutes(app, db);
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
}
const base = externalBase || `http://127.0.0.1:${server.address().port}`;
const motorista = `EXP_SMOKE_${randomUUID().slice(0, 8)}`;
const reportId = randomUUID();
const firstItemId = randomUUID();
const secondItemId = randomUUID();
let token;
let otherToken;

try {
  token = await issueTrackingToken(db, motorista);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const startedAt = new Date().toISOString();
  const common = {
    driverName: "Teste de despesas",
    routeCode: "ROTA-TESTE",
    destination: "Rota de teste",
    advanceAmount: 100,
    startDateText: "07/10/2026 12:00",
    endDateText: null,
    startedAt,
    finishedAt: null,
    status: "open",
  };
  const put = (body) => fetch(`${base}/expenses/reports/${reportId}`, {
    method: "PUT", headers, body: JSON.stringify(body),
  });
  const first = {
    ...common, revision: 1,
    items: [
      { id: firstItemId, date: "2026-10-07", supplier: "Posto", category: "Combustível", amount: "30.00", receiptUrl: "https://example.invalid/receipt.jpg", receiptPending: false },
      { id: secondItemId, date: "2026-10-07", supplier: "Pedágio", category: "Pedágio", amount: "20.00", receiptUrl: null, receiptPending: true },
    ],
  };
  assert.equal((await put(first)).status, 200);
  assert.equal((await put(first)).status, 200, "reenvio da mesma revisão deve ser idempotente");
  const [[created]] = await db.promise().query(
    "SELECT codigo_rota, valor_gasto, saldo, status FROM expense_reports WHERE id = ?", [reportId],
  );
  assert.equal(created.codigo_rota, "ROTA-TESTE");
  assert.equal(Number(created.valor_gasto), 50);
  assert.equal(Number(created.saldo), 50);
  assert.equal(created.status, "open");

  otherToken = await issueTrackingToken(db, `OTHER_${motorista}`);
  const otherDriverResponse = await fetch(`${base}/expenses/reports/${reportId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${otherToken}` },
    body: JSON.stringify({ ...first, revision: 99 }),
  });
  assert.equal(otherDriverResponse.status, 403, "outro motorista não pode alterar a prestação");

  const finished = {
    ...common, revision: 2, status: "finished",
    finishedAt: new Date().toISOString(), endDateText: "07/10/2026 18:00",
    items: [{ ...first.items[0], amount: "35.00" }],
  };
  assert.equal((await put(finished)).status, 200);
  const [[updated]] = await db.promise().query(
    "SELECT valor_gasto, saldo, status, finalizada_em FROM expense_reports WHERE id = ?", [reportId],
  );
  assert.equal(Number(updated.valor_gasto), 35);
  assert.equal(Number(updated.saldo), 65);
  assert.equal(updated.status, "finished");
  assert.ok(updated.finalizada_em);
  const [items] = await db.promise().query(
    "SELECT item_id, valor, excluida_em FROM expense_items WHERE report_id = ?", [reportId],
  );
  assert.equal(items.length, 2, "item excluído deve permanecer no histórico do banco");
  assert.equal(Number(items.find((item) => item.item_id === firstItemId).valor), 35);
  assert.ok(items.find((item) => item.item_id === secondItemId).excluida_em);
  console.log("Despesas: gravação, reenvio, edição, exclusão e finalização verificados.");
} finally {
  await db.promise().query("DELETE FROM expense_items WHERE report_id = ?", [reportId]);
  await db.promise().query("DELETE FROM expense_reports WHERE id = ?", [reportId]);
  if (token) {
    await db.promise().query("DELETE FROM tracking_tokens WHERE token_hash = ?", [createHash("sha256").update(token).digest()]);
  }
  if (otherToken) {
    await db.promise().query("DELETE FROM tracking_tokens WHERE token_hash = ?", [createHash("sha256").update(otherToken).digest()]);
  }
  await db.promise().end();
  if (server) await new Promise((resolve) => server.close(resolve));
}
