import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response, NextFunction } from 'express';

export function installAdminAuth(app: Express) {
  const filename = path.join(process.cwd(), '.admin-auth.json');
  const sessions = new Map<string, number>();
  const attempts = new Map<string, { start: number; count: number }>();
  function load() {
    if (!fs.existsSync(filename)) return null;
    return JSON.parse(fs.readFileSync(filename, 'utf8')) as { salt: string; hash: string };
  }
  function authenticated(req: Request) {
    const token = /(?:^|;\s*)buscapreco_admin=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1] || '';
    return (sessions.get(token) || 0) > Date.now();
  }
  function originAllowed(req: Request) {
    try { return !req.headers.origin || new URL(req.headers.origin).host === req.headers.host; }
    catch { return false; }
  }
  app.all('/api/auth', (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const saved = load();
    if (req.method === 'GET') return res.json({ configured: Boolean(saved), authenticated: authenticated(req) });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });
    if (!originAllowed(req)) return res.status(403).json({ error: 'Origem não autorizada.' });
    const { operation, password, setup_token } = req.body;
    if (operation === 'logout') {
      const token = /(?:^|;\s*)buscapreco_admin=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
      if (token) sessions.delete(token);
      res.clearCookie('buscapreco_admin');
      return res.json({ success: true });
    }
    if (typeof password !== 'string' || password.length > 128) return res.status(400).json({ error: 'Senha inválida.' });
    const key = req.ip || 'local';
    let rate = attempts.get(key);
    if (!rate || Date.now() - rate.start > 900000) { rate = { start: Date.now(), count: 0 }; attempts.set(key, rate); }
    if (++rate.count > 10) return res.status(429).json({ error: 'Muitas tentativas. Aguarde 15 minutos.' });
    if (operation === 'setup' || operation === 'change-password') {
      if (password.length < 10) return res.status(400).json({ error: 'Use pelo menos 10 caracteres na senha.' });
      if (operation === 'setup') {
        const token = process.env.ERP_SYNC_TOKEN || '';
        if (saved) return res.status(409).json({ error: 'Administrador já configurado.' });
        if (token.length < 32 || typeof setup_token !== 'string' || setup_token.length !== token.length ||
            !crypto.timingSafeEqual(Buffer.from(setup_token), Buffer.from(token))) return res.status(401).json({ error: 'Token de configuração inválido ou ausente.' });
      } else if (!authenticated(req)) return res.status(401).json({ error: 'Autenticação necessária.' });
      const salt = crypto.randomBytes(16).toString('hex');
      fs.writeFileSync(filename, JSON.stringify({ salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') }), { mode: 0o600 });
      sessions.clear();
    } else if (operation !== 'login' || !saved ||
        !crypto.timingSafeEqual(crypto.scryptSync(password, saved.salt, 64), Buffer.from(saved.hash, 'hex'))) {
      return res.status(401).json({ error: 'Senha inválida ou administrador não configurado.' });
    }
    attempts.delete(key);
    for (const [token, expiry] of sessions) if (expiry < Date.now()) sessions.delete(token);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + 3600000);
    res.cookie('buscapreco_admin', token, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 3600000 });
    return res.json({ success: true, authenticated: true });
  });
  const publicReads = new Set(['/status', '/products/search', '/products', '/stores', '/printers', '/sync/verify', '/sync/test-product', '/mysql/schema']);
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD'].includes(req.method) && publicReads.has(req.path)) return next();
    if (!authenticated(req)) return res.status(401).json({ error: 'Autenticação administrativa necessária.' });
    if (!originAllowed(req)) return res.status(403).json({ error: 'Origem não autorizada.' });
    next();
  });
}
