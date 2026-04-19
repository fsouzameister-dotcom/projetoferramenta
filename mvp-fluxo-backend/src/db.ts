import { Pool } from "pg";
import {
  PG_DATABASE,
  PG_HOST,
  PG_PASSWORD,
  PG_PORT,
  PG_USER,
} from "./config";

export const pool = new Pool({
  host: PG_HOST,
  port: PG_PORT,
  user: PG_USER,
  password: PG_PASSWORD,
  database: PG_DATABASE,
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
