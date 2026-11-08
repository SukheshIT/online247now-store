import { useCallback, useEffect, useState } from 'react';
import { BrowserProvider } from 'ethers';
import { ChevronRight, ShieldCheck, Zap } from 'lucide-react';
import { api } from './lib/api';
import WalletButton from './components/WalletButton';
import ProductStore from './components/ProductStore';
import ProductModal from './components/ProductModal';
import Library from './components/Library';
import Publisher from './components/Publisher';
import './index.css';

export default function App() {
  const [tab, setTab] = useState('explore');
  const [products, setProducts] = useState([]);
  const [health, setHealth] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState('');

  const loadProducts = useCallback(async (online) => {
    setLoading(true);
    try {
      setProducts(online ? await api.products() : []);
    } catch {
      setProducts([]);
      setNotice('Products could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    setWallet(await api.session());
  }, []);

  useEffect(() => {
    api.health(() => setNotice('Connecting to the store… this can take up to a minute.')).then(status => {
      setNotice(old => (old.startsWith('Connecting') ? '' : old));
      setHealth(status);
      loadProducts(status.online);
      if (status.online) refreshSession();
    });
  }, [loadProducts, refreshSession]);

  useEffect(() => {
    if (!window.ethereum?.on || !health?.online) return;
    // A different wallet account must sign in again; never keep the old session for a new account.
    const change = async () => {
      await api.logout().catch(() => {});
      setWallet(null);
    };
    window.ethereum.on('accountsChanged', change);
    return () => window.ethereum.removeListener?.('accountsChanged', change);
  }, [health]);

  const connect = async () => {
    try {
      if (!health?.online) throw new Error('Wallet sign-in opens when the store launches.');
      if (!window.ethereum) throw new Error('Install an EVM wallet extension such as MetaMask to sign in.');
      setConnecting(true);
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      if (!accounts[0]) throw new Error('No wallet account was selected.');

      const { challengeId, message } = await api.nonce(accounts[0]);
      const signature = await (await provider.getSigner()).signMessage(message);
      const verified = await api.verifySignature(challengeId, signature);
      setWallet(verified);
      setNotice('Wallet signed in.');
    } catch (error) {
      setNotice(error?.code === 'ACTION_REJECTED' || error?.code === 4001 ? 'Signature request rejected.' : (error?.shortMessage || error?.message || 'Wallet connection failed.'));
    } finally {
      setConnecting(false);
    }
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    setWallet(null);
    setTab('explore');
    setNotice('Wallet signed out.');
  };

  const nav = [
    { id: 'explore', label: 'Explore' },
    { id: 'library', label: 'My library' },
    ...(wallet?.isAdmin ? [{ id: 'publish', label: 'Publish' }] : []),
  ];

  const status = !health
    ? { color: 'text-slate-500', text: '● Checking store status…' }
    : health.online && health.paymentsEnabled
      ? { color: 'text-emerald-400', text: '● Checkout open · USDC on Base' }
      : { color: 'text-amber-300', text: '● Checkout opening soon' };

  return (
    <div className="min-h-screen flex flex-col bg-[#070a12] text-slate-100 selection:bg-purple-500 selection:text-white">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-[#070a12]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex min-h-16 items-center justify-between gap-4">
          <button onClick={() => setTab('explore')} className="text-left flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-600 to-cyan-500 p-0.5 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="text-white font-extrabold text-lg">online247now<span className="text-purple-300">.x</span></span>
              <span className="block text-[10px] uppercase tracking-widest text-slate-400 font-mono">Web3 tools & research</span>
            </div>
          </button>

          <nav aria-label="Primary navigation" className="hidden sm:flex gap-1">
            {nav.map(item => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  tab === item.id ? 'bg-purple-600/25 text-purple-200 border border-purple-500/30' : 'text-slate-300 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {health?.online && <WalletButton wallet={wallet} onConnect={connect} onLogout={logout} pending={connecting}/>}
        </div>

        <nav aria-label="Mobile navigation" className="sm:hidden border-t border-slate-800 px-3 py-2 flex justify-around">
          {nav.map(item => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`text-xs px-3 py-2 rounded font-medium transition ${tab === item.id ? 'text-purple-300 bg-purple-950/50' : 'text-slate-400'}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {notice && (
        <div role="status" className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 flex justify-between items-center gap-4 shadow-lg">
            <span>{notice}</span>
            <button onClick={() => setNotice('')} aria-label="Dismiss notice" className="text-slate-400 hover:text-white text-lg font-bold">×</button>
          </div>
        </div>
      )}

      <main className="flex-1">
        {tab === 'explore' && (
          <>
            <section className="border-b border-slate-800 bg-gradient-to-b from-[#11182b] to-[#070a12]">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 sm:py-20 grid lg:grid-cols-[1.3fr_.7fr] gap-10">
                <div>
                  <p className="text-cyan-300 font-mono text-xs uppercase tracking-[.18em]">online247now.x</p>
                  <h1 className="mt-4 text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
                    Practical Web3 tools.<br/>
                    <span className="text-gradient-purple">Clear next steps.</span>
                  </h1>
                  <p className="mt-5 max-w-2xl text-base sm:text-lg text-slate-300 leading-relaxed">
                    Guides, code and research that show what is included, what you need, and how to get started. Your verified purchases stay in your library.
                  </p>
                  <div className="mt-7 flex flex-wrap gap-3">
                    <button
                      onClick={() => document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth' })}
                      className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center gap-2 transition"
                    >
                      Browse tools <ChevronRight className="w-5 h-5"/>
                    </button>
                    <button
                      onClick={() => setTab('library')}
                      className="px-5 py-3 rounded-xl border border-slate-600 hover:border-slate-500 text-slate-100 font-semibold transition"
                    >
                      View my library
                    </button>
                  </div>
                </div>

                <aside className="glass-panel rounded-2xl p-6 self-center border border-slate-800">
                  <ShieldCheck className="text-cyan-300 w-7 h-7"/>
                  <h2 className="mt-4 text-xl font-bold text-white">Straightforward purchase flow</h2>
                  <ol className="mt-4 space-y-3 text-sm text-slate-300">
                    <li className="flex gap-3"><span className="text-purple-300 font-mono font-bold">01</span>Read the product details and requirements.</li>
                    <li className="flex gap-3"><span className="text-purple-300 font-mono font-bold">02</span>Sign in with the wallet you will use.</li>
                    <li className="flex gap-3"><span className="text-purple-300 font-mono font-bold">03</span>Pay USDC on Base; the download unlocks once the payment is confirmed on-chain.</li>
                  </ol>
                </aside>
              </div>
            </section>

            <ProductStore products={products} onSelect={setSelected} loading={loading} health={health}/>
          </>
        )}

        {tab === 'library' && <Library wallet={wallet} onConnect={connect} health={health}/>}

        {tab === 'publish' && wallet?.isAdmin && (
          <Publisher onPublished={() => {
            loadProducts(true);
            setTab('explore');
            setNotice('Product published.');
          }}/>
        )}
      </main>

      <footer className="border-t border-slate-800 bg-[#050810]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 text-sm text-slate-400 flex flex-col sm:flex-row gap-3 justify-between items-center">
          <span>online247now.x · Tools and research for Web3 builders</span>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className={status.color}>{status.text}</span>
            {health?.supportEmail && <a className="text-slate-400 hover:text-white" href={`mailto:${health.supportEmail}`}>Support</a>}
          </div>
        </div>
      </footer>

      {selected && (
        <ProductModal
          product={selected}
          wallet={wallet}
          health={health}
          onClose={() => setSelected(null)}
          onOwned={() => {}}
        />
      )}
    </div>
  );
}
