import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const geminiDevApiPlugin = (env: Record<string, string>) => ({
  name: 'gemini-dev-api',
  configureServer(server: any) {
    server.middlewares.use('/api/gemini', async (req: any, res: any) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      for (const [k, v] of Object.entries(env)) {
        if (!process.env[k]) process.env[k] = v;
      }

      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const parsedBody = body ? JSON.parse(body) : {};
          const mockReq = { method: req.method, body: parsedBody, headers: req.headers };
          const mockRes = {
            statusCode: 200,
            status(code: number) {
              this.statusCode = code;
              return this;
            },
            json(data: any) {
              res.statusCode = this.statusCode;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            },
          };

          const { default: handler } = await server.ssrLoadModule('./api/gemini.ts');
          await handler(mockReq, mockRes);
        } catch (err: any) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Internal Server Error', details: err?.message || String(err) }));
        }
      });
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    base: '/',

    server: {
      port: 3000,
      host: '0.0.0.0',
    },

    plugins: [react(), geminiDevApiPlugin(env)],

    define: {},

    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
