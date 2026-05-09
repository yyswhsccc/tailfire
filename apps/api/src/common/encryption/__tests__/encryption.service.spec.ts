import { Test } from '@nestjs/testing'
import { EncryptionService } from '../encryption.service'
import { ConfigModule } from '@nestjs/config'

describe('EncryptionService key versioning', () => {
  let service: EncryptionService

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64) // 32 bytes hex
    process.env.ENCRYPTION_KEY_V1 = 'a'.repeat(64)
    process.env.ENCRYPTION_KEY_V2 = 'b'.repeat(64)
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [EncryptionService],
    }).compile()
    service = moduleRef.get(EncryptionService)
  })

  it('encrypts with current version and decrypts with that version', () => {
    const { ciphertext, keyVersion } = service.encryptWithVersion('123-456-789')
    expect(keyVersion).toBe(service.currentKeyVersion)
    const plain = service.decryptWithVersion(ciphertext, keyVersion)
    expect(plain).toBe('123-456-789')
  })

  it('decrypts with an older key version', () => {
    const { ciphertext } = service.encryptWithVersion('456-789-012', 1)
    const plain = service.decryptWithVersion(ciphertext, 1)
    expect(plain).toBe('456-789-012')
  })

  it('throws when key version is missing from config', () => {
    expect(() => service.encryptWithVersion('x', 99)).toThrow(
      /no key configured for version 99/i
    )
  })
})
