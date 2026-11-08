import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';

// Storage: Turso (libSQL) in production, a local SQLite file for development.
// Product files are stored inside the database in 512 KB chunks, so the app needs
// no persistent disk (Render's free plan has none).
export const CHUNK_SIZE = 512 * 1024;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS challenges (id TEXT PRIMARY KEY, message TEXT NOT NULL, address TEXT NOT NULL, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, address TEXT NOT NULL, expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
    author TEXT NOT NULL, price_units TEXT NOT NULL, requirements TEXT NOT NULL, license TEXT NOT NULL,
    support_terms TEXT NOT NULL, version TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
    file_key TEXT NOT NULL, file_name TEXT NOT NULL, file_size INTEGER NOT NULL, sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS product_files (file_key TEXT NOT NULL, idx INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (file_key, idx));
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, wallet TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES products(id),
    title TEXT NOT NULL, version TEXT NOT NULL, file_key TEXT NOT NULL, file_name TEXT NOT NULL,
    sha256 TEXT NOT NULL, price_units TEXT NOT NULL, chain_id INTEGER NOT NULL, token TEXT NOT NULL,
    recipient TEXT NOT NULL, created_block INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    submitted_hash TEXT, tx_hash TEXT, created_at TEXT NOT NULL, paid_at TEXT,
    UNIQUE(chain_id, tx_hash)
  );
  CREATE INDEX IF NOT EXISTS orders_wallet ON orders(wallet);
  CREATE UNIQUE INDEX IF NOT EXISTS orders_pending ON orders(wallet,product_id,version) WHERE status='pending';
`;

export async function openDatabase(config) {
  let url = config.databaseUrl;
  if (!url) {
    mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
    url = 'file:' + path.join(config.dataDir, 'store.db');
  }
  const client = createClient({ url, authToken: config.databaseToken || undefined });
  await client.executeMultiple(SCHEMA);

  const rows = result => result.rows.map(row => Object.fromEntries(result.columns.map(column => [column, row[column]])));
  const db = {
    async all(sql, ...args) { return rows(await client.execute({ sql, args })); },
    async get(sql, ...args) { return (await db.all(sql, ...args))[0]; },
    async run(sql, ...args) { return client.execute({ sql, args }); },
    async saveFile(fileKey, buffer) {
      for (let idx = 0, offset = 0; offset < buffer.length; idx++, offset += CHUNK_SIZE) {
        await client.execute({ sql: 'INSERT INTO product_files(file_key, idx, data) VALUES(?,?,?)', args: [fileKey, idx, buffer.subarray(offset, offset + CHUNK_SIZE)] });
      }
    },
    async deleteFile(fileKey) { await client.execute({ sql: 'DELETE FROM product_files WHERE file_key=?', args: [fileKey] }); },
    async chunkCount(fileKey) { return Number((await db.get('SELECT COUNT(*) AS n FROM product_files WHERE file_key=?', fileKey)).n); },
    async chunk(fileKey, idx) {
      const row = await db.get('SELECT data FROM product_files WHERE file_key=? AND idx=?', fileKey, idx);
      return row ? Buffer.from(row.data) : null;
    },
    close() { client.close(); },
  };
  return db;
}
