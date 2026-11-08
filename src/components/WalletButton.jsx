import { LogOut, Wallet } from 'lucide-react';

const abbreviated = value => `${value.slice(0, 6)}…${value.slice(-4)}`;
export default function WalletButton({ wallet, onConnect, onLogout, pending }) {
  if (!wallet) return <button onClick={onConnect} disabled={pending} className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 text-white text-sm font-semibold flex gap-2 items-center disabled:opacity-60"><Wallet className="w-4 h-4"/>{pending ? 'Connecting…' : 'Connect wallet'}</button>;
  return <button onClick={onLogout} className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-sm flex gap-2 items-center" title="Disconnect wallet"><span className="w-2 h-2 rounded-full bg-emerald-400"/>{abbreviated(wallet.address)}<LogOut className="w-4 h-4 text-slate-400"/></button>;
}
