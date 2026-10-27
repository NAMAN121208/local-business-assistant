// scripts/register-telegram-webhook.ts
import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadEnv();

async function registerWebhook() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const vercelUrl = process.argv[2] || process.env.VERCEL_URL || 'https://local-business-assistant.vercel.app';

  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN is not set in environment or .env.local.');
    console.log('Usage: npx tsx scripts/register-telegram-webhook.ts https://your-domain.vercel.app');
    process.exit(1);
  }

  const cleanUrl = vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`;
  const webhookUrl = `${cleanUrl}/api/telegram`;

  console.log(`📡 Registering Telegram webhook to: ${webhookUrl}`);

  const apiUrl = `https://api.telegram.org/bot${token}/setWebhook`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret || undefined,
      drop_pending_updates: true,
    }),
  });

  const data = await res.json();
  if (data.ok) {
    console.log('✅ Telegram webhook registered successfully!');
    console.log(data);
  } else {
    console.error('❌ Failed to register Telegram webhook:', data);
  }
}

registerWebhook();
