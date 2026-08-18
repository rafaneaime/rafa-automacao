import 'dotenv/config';
import { signBody } from '@/lib/signature';

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const url =
  process.argv[2] ?? process.env.WEBHOOK_URL ?? 'http://localhost:3000/api/webhook';
const text = process.argv[3] ?? 'quero o preço';

const appSecret = process.env.IG_APP_SECRET;
const igUserId = process.env.IG_USER_ID;

if (!appSecret) fail('IG_APP_SECRET não está no .env.');
if (!igUserId) {
  fail(
    'IG_USER_ID não está no .env. Conecte a conta primeiro e copie o valor da tela de Configuração.',
  );
}

const payload = {
  object: 'instagram',
  entry: [
    {
      id: igUserId,
      time: Math.floor(Date.now() / 1000),
      changes: [
        {
          field: 'comments',
          value: {
            id: `teste_${Date.now()}`,
            text,
            from: { id: `testador_${Date.now()}`, username: 'teste_simulado' },
            media: { id: 'media_simulada', media_product_type: 'REELS' },
          },
        },
      ],
    },
  ],
};

const rawBody = JSON.stringify(payload);
const signature = signBody(rawBody, appSecret);

async function main() {
  console.log(`\n  Enviando comentário simulado para ${url}`);
  console.log(`  Texto: "${text}"\n`);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': signature },
    body: rawBody,
  });

  const body = await response.text();
  console.log(`  Resposta: ${response.status} ${body}\n`);

  if (response.status === 401) {
    if (body.includes('Configuração ausente')) {
      fail(`O servidor não tem IG_APP_SECRET configurado (verifique as env vars do deploy ou do .env do servidor). URL tentada: ${url}`);
    }
    fail(`Assinatura recusada. O IG_APP_SECRET do .env não bate com o do servidor. URL: ${url}`);
  }
  if (response.status !== 200) {
    fail('O servidor não respondeu 200. Veja os logs do deploy.');
  }

  console.log('  Webhook aceitou o evento.');
  console.log('  Abra a tela de Logs do painel para ver o que a automação fez.\n');
}

main().catch((error) => {
  const fetchError = error as any;
  const cause = fetchError?.cause as any;

  if (cause?.code === 'ECONNREFUSED') {
    fail(`Nenhum servidor respondendo em ${url}. Inicie o servidor localmente com: npm run dev`);
  }
  if (cause?.code === 'ENOTFOUND' || cause?.code === 'EAI_AGAIN') {
    fail(`Hostname "${new URL(url).hostname}" não pôde ser resolvido. Verifique WEBHOOK_URL no .env. URL tentada: ${url}`);
  }

  fail(`Falha ao chamar o webhook em ${url}: ${fetchError}\nCausa: ${cause}`);
});
