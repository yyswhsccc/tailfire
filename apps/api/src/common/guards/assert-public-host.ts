import { lookup } from 'dns/promises'
import { BadRequestException } from '@nestjs/common'

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fe80:/i,
  /^fc00:/i,
  /^fd/i,
]

export async function assertPublicHost(host: string): Promise<void> {
  try {
    const addresses = await lookup(host, { all: true })
    for (const addr of addresses) {
      if (PRIVATE_RANGES.some(r => r.test(addr.address))) {
        throw new BadRequestException(`Host ${host} resolves to a private IP address`)
      }
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error
    throw new BadRequestException(`Cannot resolve host: ${host}`)
  }
}
