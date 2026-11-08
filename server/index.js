import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import multer from 'multer';
import { SiweMessage, generateNonce } from 'siwe';
import { z } from 'zod';
import { loadConfig, address } from './config.js';
import { openDatabase } from './db.js';
import { createPaymentGateway, PaymentError } from './payments.js';

const config = loadConfig();
const db = await openDatabase(config);
const payments = createPaymentGateway(config);
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(express.json({ limit: '32kb', type: 'application/json' }));
// Requests arrive through the Netlify proxy, which sends the visitor's IP in x-nf-client-connection-ip.
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: req => ipKeyGenerator(req.get('x-nf-client-connection-ip') || req.ip || '0.0.0.0') }));

const now = () => Date.now();
const id = () => crypto.randomUUID();
const iso = () => new Date().toISOString();
const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const parseCookies = (value = '') => Object.fromEntries(value.split(';').map(v => v.trim().split(/=(.*)/s)).filter(([k, v]) => k && v).map(([k, v]) => [k, decodeURIComponent(v)]));
const setCookie = (res, value) => res.setHeader('Set-Cookie', `session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; ${config.production ? 'Secure; ' : ''}Max-Age=28800`);
const clearCookie = res => res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
function requireSameOrigin(req, res, next) { const origin = req.get('origin'); if (origin && origin !== config.origin) return res.status(403).json({ error: 'Request origin is not allowed.' }); next(); }
async function session(req) { const value = parseCookies(req.headers.cookie).session; if (!value) return null; const row = await db.get('SELECT address, expires FROM sessions WHERE id=?', value); if (!row || row.expires < now()) return null; return { id: value, address: row.address }; }
const requireSession = wrap(async (req, res, next) => { const user = await session(req); if (!user) return res.status(401).json({ error: 'Sign in with your wallet to continue.' }); req.user = user; next(); });
function requireAdmin(req, res, next) { if (!config.admins.includes(req.user.address.toLowerCase())) return res.status(403).json({ error: 'This wallet is not authorized to publish.' }); next(); }
function product(row) { if (!row) return null; const publicFields = { ...row }; delete publicFields.file_key; delete publicFields.sha256; return publicFields; }
function owner(row, wallet) { return row && row.wallet.toLowerCase() === wallet.toLowerCase(); }
function orderFor(row) { return { id: row.id, productId: row.product_id, title: row.title, version: row.version, amount: `${(BigInt(row.price_units) / 1_000_000n).toString()}.${(BigInt(row.price_units) % 1_000_000n).toString().padStart(6, '0')}`.replace(/\.?0+$/, ''), status: row.status, txHash: row.tx_hash, paidAt: row.paid_at, createdAt: row.created_at }; }
const paymentFor = row => ({ chainId: row.chain_id, token: row.token, recipient: row.recipient, amountUnits: row.price_units, confirmations: config.confirmations });

app.get('/api/health', (_req, res) => res.json({ paymentsEnabled: config.paymentsEnabled, chain: { id: config.chain.id, name: config.chain.name, usdc: config.chain.usdc, explorer: config.chain.explorer }, supportEmail: config.supportEmail || null }));
app.get('/api/products', wrap(async (_req, res) => res.json((await db.all("SELECT * FROM products WHERE status='published' ORDER BY updated_at DESC")).map(product))));
app.get('/api/products/:id', wrap(async (req, res) => { const row = await db.get("SELECT * FROM products WHERE id=? AND status='published'", req.params.id); if (!row) return res.status(404).json({ error: 'Product not found.' }); res.json(product(row)); }));

app.post('/api/auth/nonce', requireSameOrigin, wrap(async (req, res) => {
  const wallet = address(req.body?.address); if (!wallet) return res.status(400).json({ error: 'A valid wallet address is required.' });
  const message = new SiweMessage({ domain: config.domain, address: wallet, statement: 'Sign in to access your online247now.x library.', uri: config.origin, version: '1', chainId: config.chain.id, nonce: generateNonce(), issuedAt: new Date().toISOString(), expirationTime: new Date(now() + 5 * 60_000).toISOString() }).prepareMessage();
  const challengeId = id();
  await db.run('DELETE FROM challenges WHERE expires<?', now());
  await db.run('INSERT INTO challenges(id,message,address,expires) VALUES(?,?,?,?)', challengeId, message, wallet.toLowerCase(), now() + 5 * 60_000);
  res.json({ challengeId, message });
}));
app.post('/api/auth/verify', requireSameOrigin, wrap(async (req, res) => {
  const body = z.object({ challengeId: z.string().uuid(), signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/) }).parse(req.body);
  const challenge = await db.get('SELECT * FROM challenges WHERE id=?', body.challengeId);
  await db.run('DELETE FROM challenges WHERE expires<? OR id=?', now(), body.challengeId);
  if (!challenge || challenge.expires < now()) return res.status(401).json({ error: 'Sign-in request expired. Please try again.' });
  const parsed = new SiweMessage(challenge.message);
  const verified = await parsed.verify({ signature: body.signature, domain: config.domain, nonce: parsed.nonce, time: new Date().toISOString() }, { suppressExceptions: true });
  if (!verified.success || parsed.address.toLowerCase() !== challenge.address) return res.status(401).json({ error: 'Wallet signature could not be verified.' });
  const sessionId = id();
  await db.run('DELETE FROM sessions WHERE expires<?', now());
  await db.run('INSERT INTO sessions(id,address,expires) VALUES(?,?,?)', sessionId, challenge.address, now() + 8 * 60 * 60_000);
  setCookie(res, sessionId);
  res.json({ address: challenge.address, isAdmin: config.admins.includes(challenge.address) });
}));
app.get('/api/session', wrap(async (req, res) => { const user = await session(req); res.json(user ? { address: user.address, isAdmin: config.admins.includes(user.address) } : null); }));
app.post('/api/auth/logout', requireSameOrigin, wrap(async (req, res) => { const user = await session(req); if (user) await db.run('DELETE FROM sessions WHERE id=?', user.id); clearCookie(res); res.status(204).end(); }));

app.get('/api/library', requireSession, wrap(async (req, res) => res.json((await db.all("SELECT * FROM orders WHERE wallet=? AND status='paid' ORDER BY paid_at DESC", req.user.address)).map(orderFor))));
app.post('/api/orders', requireSameOrigin, requireSession, wrap(async (req, res) => {
  if (!config.paymentsEnabled) return res.status(503).json({ error: 'Purchases are not available yet. Contact support for availability.' });
  const body = z.object({ productId: z.string().uuid() }).parse(req.body);
  const item = await db.get("SELECT * FROM products WHERE id=? AND status='published'", body.productId); if (!item) return res.status(404).json({ error: 'Product not found.' });
  const existing = await db.get("SELECT * FROM orders WHERE wallet=? AND product_id=? AND version=? AND status='paid'", req.user.address, item.id, item.version); if (existing) return res.json({ order: orderFor(existing), alreadyOwned: true });
  const pending = await db.get("SELECT * FROM orders WHERE wallet=? AND product_id=? AND version=? AND status='pending'", req.user.address, item.id, item.version);
  if (pending && pending.price_units === item.price_units && pending.recipient === config.payout) return res.json({ order: orderFor(pending), payment: paymentFor(pending) });
  if (pending) await db.run("UPDATE orders SET status='cancelled' WHERE id=? AND status='pending'", pending.id);
  const createdBlock = await payments.head();
  const row = { id: id(), wallet: req.user.address, product_id: item.id, title: item.title, version: item.version, file_key: item.file_key, file_name: item.file_name, sha256: item.sha256, price_units: item.price_units, chain_id: config.chain.id, token: config.chain.usdc, recipient: config.payout, created_block: createdBlock, created_at: iso() };
  await db.run('INSERT INTO orders(id,wallet,product_id,title,version,file_key,file_name,sha256,price_units,chain_id,token,recipient,created_block,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', row.id, row.wallet, row.product_id, row.title, row.version, row.file_key, row.file_name, row.sha256, row.price_units, row.chain_id, row.token, row.recipient, row.created_block, row.created_at);
  res.status(201).json({ order: orderFor({ ...row, status: 'pending' }), payment: paymentFor(row) });
}));
app.post('/api/orders/:id/verify', requireSameOrigin, requireSession, wrap(async (req, res) => {
  const hash = z.object({ txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).parse(req.body).txHash;
  const order = await db.get('SELECT * FROM orders WHERE id=?', req.params.id); if (!owner(order, req.user.address)) return res.status(404).json({ error: 'Order not found.' });
  if (order.status === 'paid') return res.json({ order: orderFor(order), confirmed: true });
  if (order.status !== 'pending') return res.status(409).json({ error: 'This order is no longer open. Start a new purchase.' });
  const used = await db.get("SELECT id FROM orders WHERE chain_id=? AND tx_hash=? AND status='paid'", order.chain_id, hash); if (used) return res.status(409).json({ error: 'This transaction has already been used for another order.' });
  const result = await payments.verify(order, hash);
  await db.run('UPDATE orders SET submitted_hash=? WHERE id=?', hash, order.id);
  if (!result.confirmed) return res.status(202).json({ order: orderFor(order), confirmed: false, confirmations: result.confirmations, requiredConfirmations: config.confirmations, message: result.message || 'Waiting for network confirmations.' });
  await db.run("UPDATE orders SET status='paid', tx_hash=?, paid_at=? WHERE id=? AND status='pending'", hash, iso(), order.id);
  const paid = await db.get('SELECT * FROM orders WHERE id=?', order.id);
  res.json({ order: orderFor(paid), confirmed: true });
}));
app.get('/api/orders/:id/download', requireSession, wrap(async (req, res) => {
  const order = await db.get("SELECT * FROM orders WHERE id=? AND status='paid'", req.params.id); if (!owner(order, req.user.address)) return res.status(404).json({ error: 'Download not found.' });
  const chunks = await db.chunkCount(order.file_key); if (!chunks) return res.status(410).json({ error: 'The file is temporarily unavailable. Contact support with your order ID.' });
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(order.file_name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  for (let idx = 0; idx < chunks; idx++) {
    const data = await db.chunk(order.file_key, idx);
    if (!data) break;
    if (!res.write(data)) await new Promise(resolve => res.once('drain', resolve));
  }
  res.end();
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
app.post('/api/admin/products', requireSameOrigin, requireSession, requireAdmin, upload.single('file'), wrap(async (req, res) => {
  if (!req.file || !req.file.buffer.length) return res.status(400).json({ error: 'Attach the genuine product file to publish.' });
  const fields = z.object({ title: z.string().trim().min(3).max(120), description: z.string().trim().min(20).max(2000), category: z.string().trim().min(2).max(40), priceUsd: z.string().regex(/^\d{1,7}(\.\d{1,2})?$/), requirements: z.string().trim().min(2).max(500), license: z.string().trim().min(2).max(500), supportTerms: z.string().trim().min(2).max(500) }).parse(req.body);
  const [whole, decimals = ''] = fields.priceUsd.split('.'); const units = BigInt(whole) * 1_000_000n + BigInt((decimals + '00').slice(0, 2)) * 10_000n; if (units <= 0n) return res.status(400).json({ error: 'Price must be greater than zero.' });
  const fileKey = id(); const hash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
  try { await db.saveFile(fileKey, req.file.buffer); } catch (error) { await db.deleteFile(fileKey).catch(() => {}); throw error; }
  const timestamp = iso();
  const row = { id: id(), title: fields.title, description: fields.description, category: fields.category, author: req.user.address, price_units: units.toString(), requirements: fields.requirements, license: fields.license, support_terms: fields.supportTerms, version: '1.0.0', status: 'published', file_key: fileKey, file_name: path.basename(req.file.originalname).replace(/[\r\n"]/g, ''), file_size: req.file.size, sha256: hash, created_at: timestamp, updated_at: timestamp };
  await db.run('INSERT INTO products(id,title,description,category,author,price_units,requirements,license,support_terms,version,status,file_key,file_name,file_size,sha256,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', row.id, row.title, row.description, row.category, row.author, row.price_units, row.requirements, row.license, row.support_terms, row.version, row.status, row.file_key, row.file_name, row.file_size, row.sha256, row.created_at, row.updated_at);
  res.status(201).json(product(row));
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((error, _req, res, _next) => {
  const status = error instanceof PaymentError ? error.status : error?.name === 'ZodError' ? 400 : error?.code === 'LIMIT_FILE_SIZE' ? 413 : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: error instanceof PaymentError ? error.message : status === 413 ? 'The file is larger than 50 MB.' : status === 500 ? 'Unexpected server error.' : 'The submitted data is invalid.' });
});
if (existsSync('dist')) { app.use(express.static('dist', { index: false, maxAge: '1h' })); app.get('/{*splat}', (_req, res) => res.sendFile(path.resolve('dist/index.html'))); }
const server = app.listen(config.port, config.host, () => console.log(`online247now API listening on ${config.host}:${config.port} for ${config.origin}; payments ${config.paymentsEnabled ? 'enabled' : 'disabled'}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { payments.destroy(); db.close(); process.exit(0); }));
