import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const url = process.env.DATABASE_URL ?? 'postgresql://aarfang:aarfang@localhost:5432/aarfang'
const pool = new Pool({ connectionString: url })
const db = drizzle(pool)

console.log('Running migrations...')
await migrate(db, { migrationsFolder: path.join(__dirname, '../drizzle') })
console.log('Migrations complete.')
await pool.end()
