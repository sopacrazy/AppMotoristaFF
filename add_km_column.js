import mysql from 'mysql2/promise';
import 'dotenv/config';

async function setup() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME || "app_db",
    });

    console.log("Conectado ao banco para adicionar coluna KM...");

    try {
        // Verifica se a coluna já existe
        const [columns] = await connection.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'rota_logs' AND COLUMN_NAME = 'km'
        `, [process.env.DB_NAME || "app_db"]);

        if (columns.length === 0) {
            console.log("Adicionando coluna 'km' na tabela 'rota_logs'...");
            await connection.query("ALTER TABLE rota_logs ADD COLUMN km INT NULL AFTER acao;");
            console.log("✅ Coluna 'km' adicionada com sucesso!");
        } else {
            console.log("ℹ️ Coluna 'km' já existe na tabela 'rota_logs'.");
        }

    } catch (error) {
        console.error("❌ Erro ao modificar tabela:", error);
    } finally {
        await connection.end();
    }
}

setup();
