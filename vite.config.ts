import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.KIMI_API_KEY': JSON.stringify(env.KIMI_API_KEY),
        'process.env.KIMI_MODEL': JSON.stringify(env.KIMI_MODEL),
        'process.env.KIMI_BASE_URL': JSON.stringify(env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1'),
        'process.env.ANTHROPIC_API_KEY': JSON.stringify(env.ANTHROPIC_API_KEY),
        'process.env.ANTHROPIC_MODEL': JSON.stringify(env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514'),
        'process.env.AI_PROVIDER': JSON.stringify(env.VITE_AI_PROVIDER || 'kimi'),
        'process.env.TELEGRAM_PREMIUM_INVOICE_SLUG': JSON.stringify(env.TELEGRAM_PREMIUM_INVOICE_SLUG),
        'process.env.DJAMO_PAYMENT_URL': JSON.stringify(env.DJAMO_PAYMENT_URL),
        'process.env.WAVE_QR_URL': JSON.stringify(env.WAVE_QR_URL),
        'process.env.ADMIN_SECRET': JSON.stringify(env.ADMIN_SECRET)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
