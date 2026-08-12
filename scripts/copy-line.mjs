/**
 * Copy a single Line row from production to the local dev database, matched by label.
 *
 * Usage:
 *   SOURCE_DATABASE_URL="<production connection string>" node scripts/copy-line.mjs "Italian Game Lines (White)"
 *
 * Reads the dev DATABASE_URL from .env (target). The production URL is only ever
 * passed inline — never written to .env (see progress.md, "Dev and production use
 * separate Neon databases").
 *
 * The line's owner is matched by email between the two databases (user ids differ
 * across DBs). The target user must already exist in dev (sign in there once first).
 */

import "dotenv/config"
import { PrismaClient } from "@prisma/client"

const label = process.argv[2]
if (!label) {
  console.error('\nUsage: SOURCE_DATABASE_URL="<production connection string>" node scripts/copy-line.mjs "<line label>"\n')
  process.exit(1)
}

const SOURCE_URL = process.env.SOURCE_DATABASE_URL
if (!SOURCE_URL) {
  console.error('\nMissing SOURCE_DATABASE_URL. Get the production connection string from the Neon dashboard (production branch → Primary compute → Connect, pooled variant) and pass it inline:\n')
  console.error('  SOURCE_DATABASE_URL="<production connection string>" node scripts/copy-line.mjs "<line label>"\n')
  process.exit(1)
}

const TARGET_URL = process.env.DATABASE_URL
if (!TARGET_URL) {
  console.error("\nNo DATABASE_URL found in .env for the dev (target) database.\n")
  process.exit(1)
}

const source = new PrismaClient({ datasourceUrl: SOURCE_URL })
const target = new PrismaClient({ datasourceUrl: TARGET_URL })

try {
  const line = await source.line.findFirst({ where: { label }, include: { user: true } })
  if (!line) {
    console.error(`\nNo line found in production with label "${label}"\n`)
    process.exit(1)
  }

  const targetUser = await target.user.findUnique({ where: { email: line.user.email } })
  if (!targetUser) {
    console.error(`\nNo user with email ${line.user.email} exists in the dev database yet — sign in there once first, then re-run.\n`)
    process.exit(1)
  }

  const created = await target.line.create({
    data: {
      label: line.label,
      labelAuto: line.labelAuto,
      startFen: line.startFen,
      tree: line.tree,
      boardOrientation: line.boardOrientation,
      userId: targetUser.id,
    },
  })

  console.log(`\n✅ Copied "${line.label}" → dev database as line ${created.id} (owner: ${line.user.email})\n`)
} finally {
  await source.$disconnect()
  await target.$disconnect()
}
