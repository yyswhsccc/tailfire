import { registerDecorator, ValidationOptions } from 'class-validator'
import { isIP } from 'net'

const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /^\[?fe80:/i,
  /^\[?fc00:/i,
  /\.internal$/i,
  /\.local$/i,
  /\.localhost$/i,
]

export function IsValidEmailHost(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidEmailHost',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid public email server hostname`,
        ...options,
      },
      validator: {
        validate(value: any) {
          if (typeof value !== 'string' || !value) return false
          if (isIP(value)) return false
          return !BLOCKED_PATTERNS.some(p => p.test(value))
        },
      },
    })
  }
}
