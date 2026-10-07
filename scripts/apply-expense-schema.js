import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const path = fileURLToPath(new URL("./expense-schema.sql", import.meta.url));
const statements = (await readFile(path, "utf8"))
  .split(";")
  .map((statement) => statement.trim())
  .filter(Boolean);

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

try {
  for (const statement of statements) await connection.query(statement);
  const [routeColumn] = await connection.query("SHOW COLUMNS FROM expense_reports LIKE 'codigo_rota'");
  if (!routeColumn.length) {
    await connection.query("ALTER TABLE expense_reports ADD COLUMN codigo_rota VARCHAR(64) NULL AFTER motorista");
  }
  console.log("Tabelas de despesas prontas.");
} finally {
  await connection.end();
}
