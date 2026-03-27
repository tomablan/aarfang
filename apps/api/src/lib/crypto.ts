import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { env } from '../env.js'

const ALGO = 'aes-256-gcm'
const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex')

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, KEY, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}.${encrypted.toString('hex')}.${tag.toString('hex')}`
}

export function decrypt(ciphertext: string): string {
  const [ivHex, encHex, tagHex] = ciphertext.split('.')
  const iv = Buffer.from(ivHex, 'hex')
  const enc = Buffer.from(encHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const decipher = createDecipheriv(ALGO, KEY, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}
