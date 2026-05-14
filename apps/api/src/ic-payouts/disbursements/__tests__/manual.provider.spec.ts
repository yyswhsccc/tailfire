import { ManualPayoutProvider } from '../providers/manual.provider'
import type { PayoutSendContext } from '../payout-provider.interface'

describe('ManualPayoutProvider', () => {
  it('returns awaiting_manual without invoking the decryption accessor', async () => {
    const provider = new ManualPayoutProvider()
    const accessor = jest.fn()
    const ctx: PayoutSendContext = {
      disbursementId: 'd1',
      amountCents: 1000,
      currency: 'CAD',
      rail: 'eft',
      destination: { mask: '****1234', encryptedDetailsAccessor: accessor },
      idempotencyKey: 'k1',
    }
    const result = await provider.send(ctx)
    expect(result.status).toBe('awaiting_manual')
    expect(result.providerTxnId).toBeUndefined()
    expect(result.error).toBeUndefined()
    expect(accessor).not.toHaveBeenCalled()
  })

  it('exposes name="manual"', () => {
    expect(new ManualPayoutProvider().name).toBe('manual')
  })
})
