import { Contract, FetchRequest, Interface, JsonRpcProvider } from 'ethers';

export const ERC20_ABI = ['function transfer(address to,uint256 amount) returns (bool)', 'function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)', 'event Transfer(address indexed from,address indexed to,uint256 value)'];
const erc20 = new Interface(ERC20_ABI);
const eq = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

export class PaymentError extends Error {
  constructor(message, status = 422) { super(message); this.status = status; }
}

export function validateTransferIntent(order, tx) {
  if (Number(tx.chainId) !== order.chain_id) throw new PaymentError('Transaction is on a different network.');
  if (!eq(tx.from, order.wallet) || !eq(tx.to, order.token) || BigInt(tx.value) !== 0n) throw new PaymentError('Transaction must be a direct USDC transfer from your signed-in wallet.');
  let decoded;
  try { decoded = erc20.parseTransaction({ data: tx.data }); } catch { /* rejected below */ }
  if (!decoded || decoded.name !== 'transfer' || !eq(decoded.args[0], order.recipient) || decoded.args[1] !== BigInt(order.price_units)) throw new PaymentError('Payment recipient or USDC amount does not match this order.');
}

export function validateReceipt(order, tx, receipt, head, confirmations) {
  validateTransferIntent(order, tx);
  if (!receipt || receipt.blockNumber == null) return { confirmed: false, confirmations: 0 };
  if (!eq(receipt.hash, tx.hash)) throw new PaymentError('Receipt does not belong to this transaction.');
  if (receipt.status !== 1) throw new PaymentError('The transaction failed. No access has been granted.');
  if (receipt.blockNumber <= order.created_block) throw new PaymentError('This payment predates the order.');
  const matches = receipt.logs.filter(log => {
    if (!eq(log.address, order.token)) return false;
    try { const event = erc20.parseLog(log); return event?.name === 'Transfer' && eq(event.args.from, order.wallet) && eq(event.args.to, order.recipient) && event.args.value === BigInt(order.price_units); }
    catch { return false; }
  });
  if (matches.length !== 1) throw new PaymentError('No matching USDC transfer was found in the receipt.');
  const count = Math.max(0, head - receipt.blockNumber + 1);
  return { confirmed: count >= confirmations, confirmations: count };
}

export function createPaymentGateway(config) {
  let provider;
  if (config.rpcUrl) {
    const request = new FetchRequest(config.rpcUrl); request.timeout = 10000;
    provider = new JsonRpcProvider(request, undefined, { cacheTimeout: -1 });
  }
  async function checkNetwork() {
    if (!config.paymentsEnabled || !provider) throw new PaymentError('Purchases are not available yet.', 503);
    if (Number((await provider.getNetwork()).chainId) !== config.chain.id) throw new PaymentError('Payment service network configuration is incorrect.', 503);
    if (Number(await new Contract(config.chain.usdc, ERC20_ABI, provider).decimals()) !== 6) throw new PaymentError('USDC contract could not be verified.', 503);
  }
  return {
    async head() { await checkNetwork(); return provider.getBlockNumber(); },
    async verify(order, hash) {
      await checkNetwork();
      const tx = await provider.getTransaction(hash);
      if (!tx) return { confirmed: false, confirmations: 0, message: 'Transaction not indexed yet. Check again shortly.' };
      validateTransferIntent(order, tx);
      const [receipt, head] = await Promise.all([provider.getTransactionReceipt(hash), provider.getBlockNumber()]);
      if (receipt) {
        const block = await provider.getBlock(receipt.blockNumber);
        if (!block || !eq(block.hash, receipt.blockHash)) throw new PaymentError('Chain state changed. Check this transaction again.', 409);
      }
      return validateReceipt(order, tx, receipt, head, config.confirmations);
    },
    destroy() { provider?.destroy(); },
  };
}
