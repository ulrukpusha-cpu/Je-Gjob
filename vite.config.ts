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
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
        'process.env.GROQ_API_KEY': JSON.stringify(env.GROQ_API_KEY),
        'process.env.OPENAI_MODEL': JSON.stringify(env.OPENAI_MODEL),
        'process.env.GROQ_MODEL': JSON.stringify(env.GROQ_MODEL),
        'process.env.AI_PROVIDER': JSON.stringify(env.VITE_AI_PROVIDER || 'gemini'),
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
