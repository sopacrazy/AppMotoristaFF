import { createDriverTokenAuth } from "./trackingRoutes.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ITEM_ID_RE = /^[a-z0-9_-]{1,64}$/i;
const MAX_ITEMS = 500;

function text(value, max, required = false) {
  if (value == null && !required) return null;
  if (typeof value !== "string") throw new Error("Campo de texto inválido");
  const trimmed = value.trim();
  if (trimmed.length > max || (required && !trimmed)) throw new Error("Campo de texto inválido");
  return trimmed || null;
}

function cents(value, positive = false) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < (positive ? 0.01 : 0) || number > 9999999999.99 || Math.abs(number * 100 - Math.round(number * 100)) > 0.001) {
    throw new Error("Valor monetário inválido");
  }
  return Math.round(number * 100);
}

function isoToSql(value) {
  if (value == null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) throw new Error("Data e hora inválidas");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 5 * 60_000) throw new Error("Data e hora inválidas");
  return date.toISOString().slice(0, 23).replace("T", " ");
}

function expenseDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Data da despesa inválida");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Data da despesa inválida");
  return value;
}

function parseReport(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Prestação inválida");
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 1) throw new Error("Revisão inválida");
  if (raw.status !== "open" && raw.status !== "finished") throw new Error("Status inválido");
  if (!Array.isArray(raw.items) || raw.items.length > MAX_ITEMS) throw new Error("Lista de despesas inválida");
  const ids = new Set();
  const items = raw.items.map((item) => {
    if (!item || typeof item !== "object" || !ITEM_ID_RE.test(item.id) || ids.has(item.id)) throw new Error("Identificador de despesa inválido");
    ids.add(item.id);
    const receiptUrl = text(item.receiptUrl, 2048);
    if (receiptUrl && !/^https?:\/\//i.test(receiptUrl)) throw new Error("URL do comprovante inválida");
    return {
      id: item.id,
      date: expenseDate(item.date),
      supplier: text(item.supplier, 255),
      category: text(item.category, 120, true),
      customCategory: text(item.customCategory, 120),
      amountCents: cents(item.amount, true),
      receiptUrl,
      receiptPending: item.receiptPending === true,
    };
  });
  const advanceCents = cents(raw.advanceAmount, true);
  const spentCents = items.reduce((total, item) => total + item.amountCents, 0);
  return {
    revision: raw.revision,
    status: raw.status,
    driverName: text(raw.driverName, 160),
    routeCode: text(raw.routeCode, 64),
    destination: text(raw.destination, 255, true),
    advanceCents,
    spentCents,
    startDateText: text(raw.startDateText, 40),
    endDateText: text(raw.endDateText, 40),
    startedAt: isoToSql(raw.startedAt),
    finishedAt: isoToSql(raw.finishedAt),
    items,
  };
}

export function registerExpenseRoutes(app, db) {
  const authenticateDriver = createDriverTokenAuth(db);

  app.put("/expenses/reports/:id", authenticateDriver, async (req, res) => {
    const id = req.params.id;
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "Identificador da prestação inválido" });
    let report;
    try {
      report = parseReport(req.body);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    let connection;
    try {
      connection = await db.promise().getConnection();
      await connection.beginTransaction();
      const [existingRows] = await connection.query(
        "SELECT motorista, client_revision FROM expense_reports WHERE id = ? FOR UPDATE",
        [id],
      );
      const existing = existingRows[0];
      if (existing && existing.motorista !== req.trackingMotorista) {
        await connection.rollback();
        return res.status(403).json({ error: "Prestação pertence a outro motorista" });
      }
      if (existing && Number(existing.client_revision) >= report.revision) {
        await connection.commit();
        return res.json({ success: true, revision: Number(existing.client_revision), alreadySaved: true });
      }

      const headerValues = [
        report.routeCode, report.driverName, report.destination, report.advanceCents / 100,
        report.spentCents / 100, (report.advanceCents - report.spentCents) / 100,
        report.startDateText, report.endDateText, report.startedAt,
        report.finishedAt, report.status, report.revision,
      ];
      if (existing) {
        await connection.query(
          `UPDATE expense_reports SET codigo_rota = ?, motorista_nome = ?, destino = ?, valor_recebido = ?,
            valor_gasto = ?, saldo = ?, saida_texto = ?, retorno_texto = ?, iniciada_em = ?,
            finalizada_em = ?, status = ?, client_revision = ?, updated_at = UTC_TIMESTAMP(3)
           WHERE id = ?`,
          [...headerValues, id],
        );
      } else {
        await connection.query(
          `INSERT INTO expense_reports
           (id, motorista, codigo_rota, motorista_nome, destino, valor_recebido, valor_gasto, saldo,
            saida_texto, retorno_texto, iniciada_em, finalizada_em, status, client_revision,
            created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))`,
          [id, req.trackingMotorista, ...headerValues],
        );
      }

      await connection.query(
        "UPDATE expense_items SET excluida_em = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3) WHERE report_id = ? AND excluida_em IS NULL",
        [id],
      );
      for (const item of report.items) {
        await connection.query(
          `INSERT INTO expense_items
           (report_id, item_id, data_despesa, fornecedor, categoria, categoria_personalizada,
            valor, comprovante_url, comprovante_pendente, excluida_em, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
           ON DUPLICATE KEY UPDATE data_despesa = VALUES(data_despesa),
             fornecedor = VALUES(fornecedor), categoria = VALUES(categoria),
             categoria_personalizada = VALUES(categoria_personalizada), valor = VALUES(valor),
             comprovante_url = VALUES(comprovante_url),
             comprovante_pendente = VALUES(comprovante_pendente), excluida_em = NULL,
             updated_at = UTC_TIMESTAMP(3)`,
          [id, item.id, item.date, item.supplier, item.category, item.customCategory,
            item.amountCents / 100, item.receiptUrl, item.receiptPending ? 1 : 0],
        );
      }
      await connection.commit();
      return res.json({ success: true, revision: report.revision });
    } catch (error) {
      if (connection) await connection.rollback().catch(() => {});
      console.error("Erro ao salvar prestação de despesas:", error);
      return res.status(500).json({ error: "Erro ao salvar prestação de despesas" });
    } finally {
      connection?.release();
    }
  });

}
