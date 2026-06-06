/**
 * One-time migration: SQLite → Neon PostgreSQL
 *
 * Usage:
 *   node scripts/migrate-to-neon.mjs "postgresql://user:pass@host.neon.tech/dbname?sslmode=require"
 *
 * What this script does:
 *   1. Reads all rows from prisma/dev.db  (uses built-in node:sqlite, no native deps)
 *   2. Updates prisma/schema.prisma       (sqlite → postgresql)
 *   3. Updates .env                       (DATABASE_URL → Neon URL)
 *   4. Updates src/lib/prisma.ts          (removes hardcoded SQLite path)
 *   5. Clears old SQLite migrations
 *   6. Pushes the schema to Neon          (prisma db push)
 *   7. Regenerates the Prisma client      (prisma generate)
 *   8. Inserts all rows into Neon         (uses pg, pure JS - no native build needed)
 *
 * If anything fails after file changes begin, original files are restored.
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { DatabaseSync } from 'node:sqlite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

// ── Validate argument ──────────────────────────────────────────────────────
const NEON_URL = process.argv[2]
if (!NEON_URL) {
  console.error('\nUsage: node scripts/migrate-to-neon.mjs "<neon-connection-string>"\n')
  process.exit(1)
}
if (!NEON_URL.startsWith('postgresql://') && !NEON_URL.startsWith('postgres://')) {
  console.error('\nError: connection string must start with postgresql:// or postgres://\n')
  process.exit(1)
}

// ── File paths ─────────────────────────────────────────────────────────────
const schemaPath     = path.join(root, 'prisma', 'schema.prisma')
const envPath        = path.join(root, '.env')
const prismaLibPath  = path.join(root, 'src', 'lib', 'prisma.ts')
const migrationsPath = path.join(root, 'prisma', 'migrations')
const sqliteDbPath   = path.join(root, 'prisma', 'dev.db')

// ── Backups for rollback ───────────────────────────────────────────────────
const backups = {
  schema:    fs.readFileSync(schemaPath, 'utf8'),
  env:       fs.readFileSync(envPath, 'utf8'),
  prismaLib: fs.readFileSync(prismaLibPath, 'utf8'),
}

function restore() {
  console.log('\n↩  Restoring original files...')
  fs.writeFileSync(schemaPath,    backups.schema)
  fs.writeFileSync(envPath,       backups.env)
  fs.writeFileSync(prismaLibPath, backups.prismaLib)
  console.log('   Files restored. No changes were committed.')
}

function run(cmd, extraEnv = {}) {
  execSync(cmd, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  })
}

// ── Main ───────────────────────────────────────────────────────────────────
try {
  // 1. Read all rows from SQLite using built-in node:sqlite
  console.log('\n📤 Reading data from SQLite...')
  if (!fs.existsSync(sqliteDbPath)) {
    throw new Error(`SQLite database not found at ${sqliteDbPath}`)
  }
  const db = new DatabaseSync(sqliteDbPath)
  const cols = db.prepare("PRAGMA table_info('Position')").all().map(c => c.name)
  const hasBoardOrientation = cols.includes('boardOrientation')
  const positions = db.prepare('SELECT * FROM "Position"').all()
  db.close()
  console.log(`   Found ${positions.length} position(s)`)

  // 2. Update prisma/schema.prisma  sqlite → postgresql
  console.log('\n📝 Updating prisma/schema.prisma...')
  fs.writeFileSync(schemaPath,
    backups.schema.replace('provider = "sqlite"', 'provider = "postgresql"')
  )

  // 3. Update .env with Neon URL
  console.log('📝 Updating .env...')
  fs.writeFileSync(envPath,
    backups.env.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL="${NEON_URL}"`)
  )

  // 4. Update src/lib/prisma.ts — remove hardcoded SQLite path, use env var
  console.log('📝 Updating src/lib/prisma.ts...')
  fs.writeFileSync(prismaLibPath,
`import { PrismaClient } from "@/generated/prisma/client"

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
`)

  // 5. Clear old SQLite-specific migrations (incompatible with PostgreSQL)
  console.log('🗑️  Clearing old SQLite migrations...')
  if (fs.existsSync(migrationsPath)) {
    fs.rmSync(migrationsPath, { recursive: true, force: true })
    fs.mkdirSync(migrationsPath)
  }

  // 6. Install pg (pure JS — no C++ build tools required)
  console.log('\n📦 Installing pg...')
  run('npm install --save-dev pg @types/pg')

  // 7. Push schema to Neon
  console.log('\n🚀 Pushing schema to Neon...')
  run('npx prisma db push --skip-generate', { DATABASE_URL: NEON_URL })

  // 8. Regenerate Prisma client for PostgreSQL
  console.log('\n⚙️  Regenerating Prisma client...')
  run('npx prisma generate', { DATABASE_URL: NEON_URL })

  // 9. Insert rows into Neon
  if (positions.length > 0) {
    console.log(`\n📥 Importing ${positions.length} position(s) into Neon...`)
    const { Pool } = await import('pg')
    const pool = new Pool({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } })
    let imported = 0
    for (const pos of positions) {
      await pool.query(
        `INSERT INTO "Position"
           (id, fen, move1, move2, "correctMoves", label, "boardOrientation", "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          pos.id,
          pos.fen,
          pos.move1,
          pos.move2,
          pos.correctMoves,
          pos.label ?? null,
          hasBoardOrientation ? (pos.boardOrientation ?? 'auto') : 'auto',
          new Date(pos.createdAt),
        ]
      )
      imported++
    }
    await pool.end()
    console.log(`   ✓ Imported ${imported} position(s)`)
  } else {
    console.log('\n   No rows to import (empty database).')
  }

  // 10. Remove the migration-only dep
  console.log('\n🧹 Removing temporary migration dependency...')
  run('npm uninstall pg @types/pg')

  console.log(`
✅ Migration complete!

   • prisma/schema.prisma  → provider = "postgresql"
   • .env                  → DATABASE_URL points to Neon
   • src/lib/prisma.ts     → uses env var (no hardcoded path)
   • Old SQLite migrations cleared

Next steps:
   npm run dev             start the app against Neon
   npx prisma studio       browse data in the Neon database
`)

} catch (err) {
  console.error('\n❌ Migration failed:', err.message ?? err)
  restore()
  process.exit(1)
}
