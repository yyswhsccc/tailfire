/**
 * Supabase Storage Provider
 *
 * Implementation of StorageProvider for Supabase Storage.
 * Uses the Supabase client library for file operations.
 */

import { Logger } from '@nestjs/common'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { ApiProvider, SupabaseStorageCredentials } from '@tailfire/shared-types'
import {
  StorageProvider,
  UploadOptions,
  FileMetadata,
  ConnectionTestResult,
} from './storage-provider.interface'

export class SupabaseStorageProvider implements StorageProvider {
  readonly provider = ApiProvider.SUPABASE_STORAGE
  private readonly logger = new Logger(SupabaseStorageProvider.name)
  private client: SupabaseClient
  private readonly supabaseUrl: string

  constructor(
    credentials: SupabaseStorageCredentials,
    private readonly bucketName: string
  ) {
    this.supabaseUrl = credentials.url
    this.client = createClient(credentials.url, credentials.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    this.logger.log(`Initialized Supabase Storage provider (bucket: ${bucketName})`)
  }

  async upload(file: Buffer, path: string, options?: UploadOptions): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .upload(path, file, {
        contentType: options?.contentType,
        upsert: options?.upsert ?? false,
        cacheControl: options?.cacheControl,
      })

    if (error) {
      throw new Error(`Supabase upload failed: ${error.message}`)
    }

    return data.path
  }

  async download(path: string): Promise<Buffer> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .download(path)

    if (error) {
      throw new Error(`Supabase download failed: ${error.message}`)
    }

    if (!data) {
      throw new Error(`File not found: ${path}`)
    }

    return Buffer.from(await data.arrayBuffer())
  }

  async delete(path: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucketName)
      .remove([path])

    if (error) {
      throw new Error(`Supabase delete failed: ${error.message}`)
    }
  }

  async deleteMany(paths: string[]): Promise<void> {
    const { error } = await this.client.storage
      .from(this.bucketName)
      .remove(paths)

    if (error) {
      throw new Error(`Supabase batch delete failed: ${error.message}`)
    }
  }

  async list(prefix?: string, limit: number = 1000): Promise<FileMetadata[]> {
    const { data: files, error } = await this.client.storage
      .from(this.bucketName)
      .list(prefix, { limit })

    if (error) {
      throw new Error(`Supabase list failed: ${error.message}`)
    }

    if (!files) {
      return []
    }

    return files.map(file => ({
      name: file.name,
      path: prefix ? `${prefix}/${file.name}` : file.name,
      size: file.metadata?.size || 0,
      lastModified: new Date(file.metadata?.lastModified ?? file.created_at ?? Date.now()),
      contentType: file.metadata?.mimetype,
    }))
  }

  async getSignedUrl(path: string, expiresIn: number = 3600): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucketName)
      .createSignedUrl(path, expiresIn)

    if (error) {
      throw new Error(`Supabase signed URL creation failed: ${error.message}`)
    }

    if (!data?.signedUrl) {
      throw new Error(`No signed URL returned for path: ${path}`)
    }

    return data.signedUrl
  }

  async exists(path: string): Promise<boolean> {
    try {
      const { data, error } = await this.client.storage
        .from(this.bucketName)
        .download(path)

      if (error) {
        if (error.message.includes('not found')) {
          return false
        }
        throw error
      }

      return data !== null
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.logger.warn(`Error checking file existence for ${path}: ${message}`)
      return false
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const startTime = Date.now()

    try {
      // Test 1: Try to list the bucket (lightweight operation)
      const { error: listError } = await this.client.storage
        .from(this.bucketName)
        .list('', { limit: 1 })

      if (listError) {
        return {
          success: false,
          message: `Failed to access bucket '${this.bucketName}'`,
          error: listError.message,
          responseTimeMs: Date.now() - startTime,
        }
      }

      // Test 2: Verify we can upload a test file
      const testPath = `.connection-test-${Date.now()}.txt`
      const testContent = Buffer.from('connection test')

      const { error: uploadError } = await this.client.storage
        .from(this.bucketName)
        .upload(testPath, testContent, { upsert: true })

      if (uploadError) {
        return {
          success: false,
          message: 'Bucket accessible but upload permission denied',
          error: uploadError.message,
          responseTimeMs: Date.now() - startTime,
        }
      }

      // Clean up test file
      await this.client.storage.from(this.bucketName).remove([testPath])

      const responseTime = Date.now() - startTime

      return {
        success: true,
        message: `Successfully connected to Supabase Storage (bucket: ${this.bucketName})`,
        responseTimeMs: responseTime,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        success: false,
        message: 'Connection test failed',
        error: message,
        responseTimeMs: Date.now() - startTime,
      }
    }
  }

  getProviderInfo() {
    return {
      provider: this.provider,
      bucketName: this.bucketName,
    }
  }

  getPublicUrl(path: string): string {
    // Supabase Storage public URL format:
    // {supabaseUrl}/storage/v1/object/public/{bucket}/{path}
    return `${this.supabaseUrl}/storage/v1/object/public/${this.bucketName}/${path}`
  }
}
