// Ejecutar con: node scripts/backfill_hypothesis_paths.js
// (o con bun: bun scripts/backfill_hypothesis_paths.js)

const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');
const db = new PrismaClient();

(async () => {
  const hyps = await db.hypothesis.findMany({ where: { texPath: null } });
  console.log(`Found ${hyps.length} hypotheses without texPath`);

  let updated = 0, missing = 0;
  for (const h of hyps) {
    const rel = 'research/hypotheses/' + h.shortCode + '.tex';
    const abs = path.join(process.cwd(), rel);
    if (fs.existsSync(abs)) {
      await db.hypothesis.update({
        where: { id: h.id },
        data: { texPath: rel },
      });
      updated++;
      console.log(`  ✓ ${h.shortCode} -> ${rel}`);
    } else {
      missing++;
      console.log(`  ✗ ${h.shortCode} — file not found at ${abs}`);
    }
  }

  console.log(`\nDone: ${updated} updated, ${missing} skipped (file not on disk)`);
  await db.$disconnect();
})().catch(e => {
  console.error(e);
  process.exit(1);
});