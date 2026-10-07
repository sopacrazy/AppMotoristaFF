import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const path = fileURLToPath(new URL("./tracking-schema.sql", import.meta.url));
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
  for (const statement of statements) {
    await connection.query(statement);
  }
  console.log("Tabelas de rastreio prontas.");
} finally {
  await connection.end();
}
