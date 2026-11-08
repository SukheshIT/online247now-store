import path from 'node:path';
import { getAddress, ZeroAddress } from 'ethers';

export const BASE = Object.freeze({
  id: 8453, name: 'Base', nativeSymbol: 'ETH',
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6,
  explorer: 'https://basescan.org', rpcPublic: 'https://mainnet.base.org',
});

export function address(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) return null;
  try { const result = getAddress(value.toLowerCase()); return result === ZeroAddress ? null : result; }
  catch { return null; }
}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  if (production && !env.APP_ORIGIN) throw new Error('APP_ORIGIN is required in production.');
  const origin = new URL(env.APP_ORIGIN || 'http://127.0.0.1:5173');
  if (production && origin.protocol !== 'https:') throw new Error('Production APP_ORIGIN must use HTTPS.');
  if (origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash) throw new Error('APP_ORIGIN must be an origin only.');
  const admins = (env.ADMIN_WALLETS || '').split(',').map(x => x.trim()).filter(Boolean).map(x => {
    const a = address(x); if (!a) throw new Error('ADMIN_WALLETS contains an invalid address.'); return a.toLowerCase();
  });
  const confirmations = Number(env.CONFIRMATIONS || 12);
  if (!Number.isInteger(confirmations) || confirmations < 2 || confirmations > 1000) throw new Error('CONFIRMATIONS must be between 2 and 1000.');
  const payout = address(env.PAYOUT_WALLET);
  const rpcUrl = env.RPC_URL || '';
  if (rpcUrl && !['https:', ...(production ? [] : ['http:'])].includes(new URL(rpcUrl).protocol)) throw new Error('Use an HTTPS RPC endpoint in production.');
  const databaseUrl = env.TURSO_DATABASE_URL || '';
  if (production && !databaseUrl) throw new Error('TURSO_DATABASE_URL is required in production (the server has no persistent disk).');
  const supportEmail = env.SUPPORT_EMAIL || '';
  const ready = env.PAYMENTS_ENABLED === 'true' && Number(env.CHAIN_ID || BASE.id) === BASE.id && !!payout && !!rpcUrl && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail);
  return {
    production, origin: origin.origin, domain: origin.host, admins,
    port: Number(env.PORT || 3001), host: env.HOST || (production ? '0.0.0.0' : '127.0.0.1'),
    dataDir: path.resolve(env.DATA_DIR || 'data'),
    databaseUrl, databaseToken: env.TURSO_AUTH_TOKEN || '',
    chain: BASE, payout, rpcUrl, confirmations, supportEmail,
    paymentsEnabled: ready,
  };
}
