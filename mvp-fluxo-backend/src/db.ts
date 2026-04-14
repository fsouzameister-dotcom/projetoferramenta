import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT || 5432),
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
});

export async function testDbConnection() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query("SELECT NOW() as now");
    console.log("Postgres conectado. NOW():", rows[0].now);
  } finally {
    client.release();
  }
}