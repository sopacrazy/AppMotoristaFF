import mysql from "mysql2";
import "dotenv/config";

const db = mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "app_db",
});

const createTables = async () => {
    const tables = [
        `CREATE TABLE IF NOT EXISTS checklist_diario (
      id INT AUTO_INCREMENT PRIMARY KEY,
      motorista_id VARCHAR(255) NOT NULL,
      veiculo_placa VARCHAR(20) NOT NULL,
      data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

        `CREATE TABLE IF NOT EXISTS checklist_respostas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      checklist_id INT NOT NULL,
      pergunta_id VARCHAR(50),
      categoria VARCHAR(50),
      pergunta_texto VARCHAR(255),
      status ENUM('OK', 'PROBLEM'),
      observacao TEXT,
      FOREIGN KEY (checklist_id) REFERENCES checklist_diario(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

        `CREATE TABLE IF NOT EXISTS checklist_ocorrencias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      checklist_id INT NOT NULL,
      foto_url TEXT,
      observacao TEXT,
      FOREIGN KEY (checklist_id) REFERENCES checklist_diario(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    ];

    console.log("🛠️ Iniciando criação das tabelas de Checklist...");

    db.connect((err) => {
        if (err) {
            console.error("❌ Erro ao conectar no MySQL:", err);
            process.exit(1);
        }
        console.log("✅ Conectado ao MySQL");

        let completed = 0;
        tables.forEach((sql) => {
            db.query(sql, (err) => {
                if (err) {
                    console.error("❌ Erro ao criar tabela:", err);
                } else {
                    console.log("✅ Tabela verificada/criada com sucesso.");
                }
                completed++;
                if (completed === tables.length) {
                    console.log("🚀 Setup do banco concluído!");
                    db.end();
                    process.exit(0);
                }
            });
        });
    });
};

createTables();
