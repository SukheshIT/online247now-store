import { useEffect, useRef, useState } from 'react';
import { BrowserProvider, Contract } from 'ethers';
import { AlertCircle, CheckCircle2, Download, ExternalLink, Loader2, X } from 'lucide-react';
import { api } from '../lib/api';
import { money } from './ProductStore';

const ERC20 = ['function transfer(address to,uint256 amount) returns (bool)', 'function balanceOf(address) view returns (uint256)'];
const short = value => (value ? `${value.slice(0, 7)}…${value.slice(-4)}` : '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export default function ProductModal({ product, wallet, health, onClose, onOwned }) {
  const close = useRef();
  const alive = useRef(true);
  const [phase, setPhase] = useState('details');
  const [message, setMessage] = useState('');
  const [order, setOrder] = useState(null);
  const [recipient, setRecipient] = useState(null);

  useEffect(() => {
    alive.current = true;
    close.current?.focus();
    const listener = event => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', listener);
    return () => { alive.current = false; document.removeEventListener('keydown', listener); };
  }, [onClose]);

  // Ask the server to verify the transaction until it has enough confirmations.
  const waitForVerification = async (orderId, txHash) => {
    for (let attempt = 0; attempt < 90 && alive.current; attempt++) {
      const result = await api.verifyOrder(orderId, txHash);
      if (result?.confirmed) return result;
      setMessage(`${result?.message || 'Waiting for network confirmations.'} ${result?.confirmations ?? 0}/${result?.requiredConfirmations ?? '…'}`);
      await sleep(5000);
    }
    throw new Error('Payment is still confirming. It will appear in My library once confirmed — check back in a few minutes.');
  };

  const buy = async () => {
    try {
      setMessage('');
      if (!health?.online || !health?.paymentsEnabled) throw new Error('Purchases are not available yet.');
      if (!wallet) throw new Error('Connect and sign in with the wallet you will use to pay.');
      if (!window.ethereum) throw new Error('Install an EVM wallet such as MetaMask to pay.');

      setPhase('creating');
      const result = await api.createOrder(product.id);
      setOrder(result.order);
      if (result.alreadyOwned) { setPhase('owned'); onOwned?.(false); return; }
      setRecipient(result.payment.recipient);

      const provider = new BrowserProvider(window.ethereum);
      const network = await provider.getNetwork();
      if (Number(network.chainId) !== result.payment.chainId) {
        const chainHex = `0x${result.payment.chainId.toString(16)}`;
        try {
          await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainHex }] });
        } catch (switchError) {
          if (switchError?.code !== 4902) throw switchError;
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{ chainId: chainHex, chainName: 'Base', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: ['https://mainnet.base.org'], blockExplorerUrls: ['https://basescan.org'] }],
          });
        }
      }

      const signer = await new BrowserProvider(window.ethereum).getSigner();
      const sender = (await signer.getAddress()).toLowerCase();
      if (sender !== wallet.address.toLowerCase()) throw new Error('The paying wallet must be the same wallet used to sign in.');

      const token = new Contract(result.payment.token, ERC20, signer);
      const balance = await token.balanceOf(sender);
      if (balance < BigInt(result.payment.amountUnits)) throw new Error(`Insufficient USDC on Base. This order requires ${money(result.payment.amountUnits)}.`);

      setPhase('wallet');
      const transaction = await token.transfer(result.payment.recipient, BigInt(result.payment.amountUnits));
      setPhase('confirming');
      setMessage('Transaction submitted. Waiting for Base confirmations…');
      await transaction.wait(1);

      const verified = await waitForVerification(result.order.id, transaction.hash);
      if (!alive.current) return;
      setOrder(verified.order);
      setMessage('');
      setPhase('owned');
      onOwned?.(false);
    } catch (error) {
      if (!alive.current) return;
      setPhase('details');
      setMessage(error?.code === 'ACTION_REJECTED' ? 'Payment was cancelled in your wallet.' : (error?.shortMessage || error?.message || 'Payment could not be completed.'));
    }
  };

  const explorer = order?.txHash ? `${health?.chain?.explorer || 'https://basescan.org'}/tx/${order.txHash}` : null;
  const canBuy = health?.online && health?.paymentsEnabled;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 p-4 flex items-center justify-center" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="product-title" className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-950 border border-slate-700 shadow-2xl p-6 relative">
        <button ref={close} onClick={onClose} className="absolute right-4 top-4 p-2 text-slate-400 hover:text-white" aria-label="Close product details">
          <X/>
        </button>
        <p className="text-xs font-mono text-cyan-300">{product.category} · version {product.version}</p>
        <h2 id="product-title" className="mt-2 text-2xl font-bold text-white pr-10">{product.title}</h2>
        <p className="mt-3 text-slate-300 leading-relaxed whitespace-pre-line">{product.description}</p>

        <dl className="mt-6 divide-y divide-slate-800 border-y border-slate-800">
          <div className="py-3 flex justify-between gap-5">
            <dt className="text-slate-400">Price</dt>
            <dd className="text-white font-semibold">{money(product.price_units)} on Base</dd>
          </div>
          {product.file_name && (
            <div className="py-3 flex justify-between gap-5">
              <dt className="text-slate-400">File</dt>
              <dd className="text-slate-200 font-mono text-sm text-right">{product.file_name}{product.file_size ? ` · ${(product.file_size / 1024 / 1024).toFixed(1)} MB` : ''}</dd>
            </div>
          )}
          <div className="py-3"><dt className="text-slate-400">Requirements</dt><dd className="mt-1 text-slate-200">{product.requirements}</dd></div>
          <div className="py-3"><dt className="text-slate-400">License</dt><dd className="mt-1 text-slate-200">{product.license}</dd></div>
          <div className="py-3"><dt className="text-slate-400">Support</dt><dd className="mt-1 text-slate-200">{product.support_terms}</dd></div>
        </dl>

        {message && (
          <p role="status" className="mt-4 text-sm text-amber-200 flex gap-2">
            <AlertCircle className="w-5 h-5 shrink-0"/>{message}
          </p>
        )}

        {phase === 'owned' && order ? (
          <div className="mt-6">
            <p className="text-emerald-300 flex gap-2"><CheckCircle2/>Purchase confirmed. This product is in your library.</p>
            <a href={api.downloadUrl(order.id)} className="mt-4 w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex justify-center gap-2">
              <Download/>Download {product.file_name || 'file'}
            </a>
            {explorer && (
              <a className="mt-3 text-sm text-purple-300 hover:text-white flex justify-center gap-1" target="_blank" rel="noreferrer" href={explorer}>
                View Base transaction <ExternalLink className="w-4 h-4"/>
              </a>
            )}
          </div>
        ) : (
          <button onClick={buy} disabled={phase !== 'details' || !canBuy} className="mt-6 w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-60 disabled:hover:bg-purple-600 text-white font-semibold flex justify-center gap-2">
            {phase !== 'details' && <Loader2 className="animate-spin"/>}
            {phase === 'creating' ? 'Creating order…' : phase === 'wallet' ? 'Confirm in wallet…' : phase === 'confirming' ? 'Confirming payment…' : canBuy ? `Pay ${money(product.price_units)} with USDC` : 'Purchases not open yet'}
          </button>
        )}

        <p className="mt-3 text-center text-xs text-slate-500">
          Your wallet shows the Base USDC contract, the recipient{recipient ? ` (${short(recipient)})` : ''} and the exact amount before you approve.
          {health?.supportEmail ? <> Support: <a className="underline" href={`mailto:${health.supportEmail}`}>{health.supportEmail}</a></> : null}
        </p>
      </section>
    </div>
  );
}
