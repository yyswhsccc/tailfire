import type { Rail } from '../payout-accounts/ic-payout-accounts.service'

/**
 * Context handed to a PayoutProvider when sending a disbursement.
 *
 * `destination.encryptedDetailsAccessor` is a deferred decryption function — providers
 * that need the cleartext (wire transfer routing, EFT account details) invoke it,
 * which triggers an audit-logged decrypt. Providers that don't need cleartext (manual
 * provider, webhook callbacks) never invoke it.
 */
export interface PayoutSendContext {
  disbursementId: string
  amountCents: number
  currency: string
  rail: Rail
  destination: {
    mask: string
    encryptedDetailsAccessor: () => Promise<Record<string, unknown>>
  }
  idempotencyKey: string
}

export interface PayoutSendResult {
  status: 'awaiting_manual' | 'sent' | 'failed'
  providerTxnId?: string
  error?: string
}

export type PayoutProviderName = 'manual' | 'vopay' | 'dreampay'

export interface PayoutProvider {
  readonly name: PayoutProviderName
  send(ctx: PayoutSendContext): Promise<PayoutSendResult>
}
