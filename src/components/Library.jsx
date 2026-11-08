import { useEffect, useState } from 'react';
import { Download, ExternalLink, Wallet } from 'lucide-react';
import { api } from '../lib/api';

export default function Library({ wallet, onConnect, health }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!!wallet);

  useEffect(() => {
    if (!wallet) return;
    setLoading(true);
    setError('');
    api.library()
      .then(setItems)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [wallet]);

  const explorer = health?.chain?.explorer || 'https://basescan.org';

  if (!wallet) {
    return (
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <Wallet className="text-purple-300 w-8 h-8"/>
        <h1 className="mt-4 text-3xl text-white font-bold">Your library</h1>
        <p className="mt-3 text-slate-400">
          Sign in with the wallet used for purchase to restore your downloads and receipts.
        </p>
        {!health?.online ? (
          <p className="mt-6 text-amber-200">Sign-in opens when the store launches.</p>
        ) : (
          <button onClick={onConnect} className="mt-6 px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold transition">
            Connect wallet
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      <p className="text-xs uppercase tracking-widest text-cyan-300 font-mono">My library</p>
      <h1 className="mt-2 text-3xl text-white font-bold">Your purchases</h1>

      {loading ? (
        <p className="mt-6 text-slate-400">Loading your library…</p>
      ) : error ? (
        <p className="mt-6 text-rose-300">{error}</p>
      ) : items.length ? (
        <div className="mt-7 space-y-4">
          {items.map(item => (
            <article key={item.id} className="glass-panel rounded-xl p-5 flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">{item.title}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Version {item.version}{item.paidAt ? ` · purchased ${new Date(item.paidAt).toLocaleDateString()}` : ''}
                </p>
              </div>
              <div className="flex gap-3">
                <a
                  href={api.downloadUrl(item.id)}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-2 transition"
                >
                  <Download className="w-4 h-4"/>Download
                </a>
                {item.txHash && (
                  <a
                    href={`${explorer}/tx/${item.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:text-white flex items-center gap-1 transition"
                    aria-label="View transaction"
                  >
                    <ExternalLink className="w-4 h-4"/>
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-7 glass-panel rounded-xl p-6">
          <p className="text-white font-semibold">No purchases yet.</p>
          <p className="mt-2 text-slate-400">
            When a Base USDC payment is confirmed, its download will appear here.
          </p>
        </div>
      )}
    </section>
  );
}
