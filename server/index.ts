import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';

const app = new Hono();
app.get('/api/health', (context) => context.json({ ok: true, service: '拼贴时光' }));
app.all('/api/*', (context) => context.json({ error: '接口不存在。' }, 404));
app.use('*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));
app.onError((_error, context) => context.json({ error: '服务暂时无法处理请求，请稍后重试。' }, 500));

const port = Number(process.env.PORT ?? 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是 1–65535 之间的整数。');
export { app };
export default { hostname: process.env.HOST?.trim() || '127.0.0.1', port, fetch: app.fetch };
