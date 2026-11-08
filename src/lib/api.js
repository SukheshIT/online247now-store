// Client for the online247now.x API (server/index.js).
// There are deliberately NO offline fallbacks here: if the API is not reachable,
// the store shows "coming soon" and every purchase, sign-in and download is refused.
// Sessions, admin rights, orders and downloads are decided only by the server.

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const OFFLINE_MESSAGE = 'The store service is not connected yet. Purchases and sign-in will open soon.';

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: 'same-origin',
      ...options,
      headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
    });
  } catch {
    throw new ApiError(OFFLINE_MESSAGE, 0);
  }
  if (response.status === 204) return null;
  // A static host (e.g. Netlify without a backend) may answer with an HTML page; treat that as offline.
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  if (!isJson) throw new ApiError(OFFLINE_MESSAGE, response.status || 0);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status === 404 && path === '/api/health' ? OFFLINE_MESSAGE : (payload.error || 'Request failed.'), response.status);
  return payload;
}

export const api = {
  // Returns { online:false, paymentsEnabled:false } when no backend is deployed.
  // The store server runs on a free plan that sleeps when idle; it takes up to about a
  // minute to wake, so 5xx/timeouts are retried while onWaking() lets the UI say so.
  health: async (onWaking) => {
    for (let attempt = 0; attempt < 9; attempt++) {
      try {
        const res = await request('/api/health');
        return { online: true, ...res };
      } catch (error) {
        const waking = error.status === 0 || error.status >= 500;
        if (!waking) break;
        onWaking?.();
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
    }
    return { online: false, paymentsEnabled: false, chain: null, supportEmail: null };
  },
  products: async () => {
    const res = await request('/api/products');
    return Array.isArray(res) ? res : [];
  },
  product: id => request(`/api/products/${encodeURIComponent(id)}`),
  session: async () => {
    try { return await request('/api/session'); } catch { return null; }
  },
  library: async () => {
    const res = await request('/api/library');
    return Array.isArray(res) ? res : [];
  },
  nonce: address => request('/api/auth/nonce', { method: 'POST', body: JSON.stringify({ address }) }),
  verifySignature: (challengeId, signature) => request('/api/auth/verify', { method: 'POST', body: JSON.stringify({ challengeId, signature }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  createOrder: productId => request('/api/orders', { method: 'POST', body: JSON.stringify({ productId }) }),
  // Resolves { confirmed:true, order } or { confirmed:false, confirmations, requiredConfirmations, message }.
  verifyOrder: (id, txHash) => request(`/api/orders/${encodeURIComponent(id)}/verify`, { method: 'POST', body: JSON.stringify({ txHash }) }),
  downloadUrl: orderId => `/api/orders/${encodeURIComponent(orderId)}/download`,
  publish: form => request('/api/admin/products', { method: 'POST', body: form }),
};
