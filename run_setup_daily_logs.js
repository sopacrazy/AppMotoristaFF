import mysql from 'mysql2/promise';
import 'dotenv/config';

async function setup() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "app_db",
    });

    console.log("Conectado ao banco para setup...");

    const sql = `
    CREATE TABLE IF NOT EXISTS daily_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        motorista_id VARCHAR(50) NOT NULL,
        route_id VARCHAR(50),
        local TEXT NOT NULL,
        status ENUM('pendente', 'concluido') DEFAULT 'pendente',
        hora_inicio TIME NOT NULL,
        hora_fim TIME,
        foto_url TEXT,
        data DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_motorista_data (motorista_id, data)
    );
    `;

    try {
        await connection.query(sql);
        console.log("✅ Tabela daily_logs criada com sucesso!");
    } catch (error) {
        console.error("❌ Erro ao criar tabela:", error);
    } finally {
        await connection.end();
    }
}

setup();
