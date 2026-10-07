import mysql from 'mysql2';
import 'dotenv/config';

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
db.query('SELECT id, username, nome_motorista FROM login ORDER BY id DESC LIMIT 50', (err, results) => {
  if (err) {
    console.error(err);
  } else {
    console.log(JSON.stringify(results, null, 2));
  }
  process.exit();
});
