import test from 'node:test';
import assert from 'node:assert/strict';
import { Interface } from 'ethers';
import { validateTransferIntent, PaymentError } from './payments.js';

const token = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const buyer = '0x1111111111111111111111111111111111111111';
const recipient = '0x55e840Ff05f946A120eA9DCCf11bF030800dC8E7';
const abi = new Interface(['function transfer(address to,uint256 amount) returns (bool)']);
const order = { chain_id: 8453, wallet: buyer, token, recipient, price_units: '49000000' };
const valid = () => ({ chainId: 8453, from: buyer, to: token, value: 0n, data: abi.encodeFunctionData('transfer', [recipient, 49000000n]) });

test('accepts only the order exact USDC transfer', () => assert.doesNotThrow(() => validateTransferIntent(order, valid())));
test('rejects a different recipient or amount', () => {
  const differentRecipient = { ...valid(), data: abi.encodeFunctionData('transfer', ['0x2222222222222222222222222222222222222222', 49000000n]) };
  assert.throws(() => validateTransferIntent(order, differentRecipient), PaymentError);
  const differentAmount = { ...valid(), data: abi.encodeFunctionData('transfer', [recipient, 1n]) };
  assert.throws(() => validateTransferIntent(order, differentAmount), PaymentError);
});
