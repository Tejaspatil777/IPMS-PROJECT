require('dotenv').config();
const { Pool, types } = require('pg');

// pg driver ko MySQL jaisa shape dene ke liye type parsers.
// DATE/TIMESTAMP: JS Date object banne ke bajaye plain string rahe
// (warna '2026-08-01' ki jagah '2026-08-01T00:00:00.000Z' aa jata hai
//  aur <input type="date"> + table display dono toot jaate hain).
types.setTypeParser(1082, v => v); // DATE        -> 'YYYY-MM-DD'
types.setTypeParser(1114, v => v); // TIMESTAMP   -> 'YYYY-MM-DD HH:mm:ss'
types.setTypeParser(1184, v => v); // TIMESTAMPTZ -> string

// COUNT()/SUM() bigint (OID 20) ko number banao, warna JSON mein string aata hai
types.setTypeParser(20, v => Number(v));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10
});

module.exports = pool;
