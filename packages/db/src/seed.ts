import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import * as schema from './schema.js'

const { Pool } = pg

const url = process.env.DATABASE_URL ?? 'postgresql://aarfang:aarfang@localhost:5432/aarfang'
const pool = new Pool({ connectionString: url })
const db = drizzle(pool, { schema })

console.log('Seeding database...')

// Organisation
const [org] = await db
  .insert(schema.organizations)
  .values({ name: 'Aarfang Demo', slug: 'aarfang-demo', plan: 'pro' })
  .onConflictDoNothing()
  .returning()

if (!org) {
  console.log('Seed already applied (org exists). Skipping.')
  await pool.end()
  process.exit(0)
}

// Utilisateur admin
const passwordHash = await bcrypt.hash('admin1234', 12)
const [user] = await db
  .insert(schema.users)
  .values({
    orgId: org.id,
    email: 'hello@aarfang.com',
    passwordHash,
    firstName: 'Super',
    lastName: 'Admin',
    role: 'super_admin',
  })
  .returning()

// Quelques sites de démonstration
await db.insert(schema.sites).values([
  { orgId: org.id, url: 'https://example.com', name: 'Example.com', cmsType: 'other' },
])

console.log('✓ Seed complete.')
console.log(`  Org    : ${org.name} (${org.id})`)
console.log(`  User   : ${user.email} / admin1234`)
console.log(`  Login  : http://localhost:5173/login`)

await pool.end()
