import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não está definida. Preencha o .env antes de rodar.');
    process.exit(1);
  }

  const schema = readFileSync('db/schema.sql', 'utf8');
  const client = neon(url);

  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    await client.query(statement);
  }

  console.log(`Schema aplicado: ${statements.length} comandos executados.`);
}

main().catch((error) => {
  console.error('Falha ao aplicar o schema:', error);
  process.exit(1);
});
