import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for image upload actions.
 *
 * The upload path uses a two-step signed-URL flow to bypass Vercel's 4.5 MB
 * Server Action body limit:
 *   1. createImageUploadUrl validates inputs and mints a signed upload URL
 *   2. The browser PUTs the file directly to Supabase Storage
 *   3. confirmImageUpload inserts the metadata row
 *
 * These tests focus on:
 * 1. Input validation (type, size)
 * 2. Admin gating
 * 3. Signed-URL minting
 * 4. Database insert + cleanup-on-failure for confirmImageUpload
 */

// Mock dependencies before imports
vi.mock('@/lib/supabase-server', () => {
  const createQueryBuilder = () => {
    const builder: Record<string, ReturnType<typeof vi.fn>> = {}
    const methods = [
      'select',
      'eq',
      'neq',
      'gte',
      'lte',
      'gt',
      'lt',
      'not',
      'or',
      'in',
      'order',
      'limit',
      'range',
      'single',
      'maybeSingle',
      'insert',
      'update',
      'delete',
    ]

    methods.forEach((method) => {
      builder[method] = vi.fn(() => builder)
    })

    builder.single = vi.fn().mockResolvedValue({
      data: { id: 'image-1' },
      error: null,
    })

    return builder
  }

  const queryBuilder = createQueryBuilder()

  // Create shared storage mocks that persist across calls
  const removeMock = vi.fn().mockResolvedValue({ error: null })
  const getPublicUrlMock = vi.fn().mockReturnValue({
    data: { publicUrl: 'https://example.com/image.jpg' },
  })
  const createSignedUploadUrlMock = vi.fn().mockResolvedValue({
    data: {
      signedUrl: 'https://example.com/signed-upload-url',
      token: 'signed-token',
      path: 'mock-path',
    },
    error: null,
  })

  const storageBucketMock = {
    remove: removeMock,
    getPublicUrl: getPublicUrlMock,
    createSignedUploadUrl: createSignedUploadUrlMock,
  }

  return {
    getSupabaseAdmin: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
      storage: {
        from: vi.fn(() => storageBucketMock),
      },
    })),
    __queryBuilder: queryBuilder,
    __removeMock: removeMock,
    __createSignedUploadUrlMock: createSignedUploadUrlMock,
    __reset: () => {
      queryBuilder.single.mockReset()
      queryBuilder.single.mockResolvedValue({
        data: { id: 'image-1' },
        error: null,
      })
      removeMock.mockReset()
      removeMock.mockResolvedValue({ error: null })
      createSignedUploadUrlMock.mockReset()
      createSignedUploadUrlMock.mockResolvedValue({
        data: {
          signedUrl: 'https://example.com/signed-upload-url',
          token: 'signed-token',
          path: 'mock-path',
        },
        error: null,
      })
    },
    __mockSignSuccess: () => {
      createSignedUploadUrlMock.mockResolvedValueOnce({
        data: {
          signedUrl: 'https://example.com/signed-upload-url',
          token: 'signed-token',
          path: 'mock-path',
        },
        error: null,
      })
    },
    __mockSignError: (error: unknown) => {
      createSignedUploadUrlMock.mockResolvedValueOnce({ data: null, error })
    },
    __mockDbInsertSuccess: () => {
      queryBuilder.single.mockResolvedValueOnce({
        data: { id: 'image-1' },
        error: null,
      })
    },
    __mockDbInsertError: (error: unknown) => {
      queryBuilder.single.mockResolvedValueOnce({
        data: null,
        error,
      })
    },
  }
})

const requireAdminMock = vi.fn().mockResolvedValue({
  id: 'admin-1',
  email: 'admin@test.com',
  name: 'Test Admin',
})

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: () => requireAdminMock(),
}))

// Import after mocks
import { createImageUploadUrl, confirmImageUpload } from '@/lib/actions/images'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __removeMock: ReturnType<typeof vi.fn>
  __createSignedUploadUrlMock: ReturnType<typeof vi.fn>
  __reset: () => void
  __mockSignSuccess: () => void
  __mockSignError: (error: unknown) => void
  __mockDbInsertSuccess: () => void
  __mockDbInsertError: (error: unknown) => void
}>('@/lib/supabase-server')

describe('createImageUploadUrl', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
    requireAdminMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Test Admin',
    })
  })

  describe('admin gating', () => {
    it('rejects non-admin callers', async () => {
      requireAdminMock.mockRejectedValueOnce(new Error('Not authorized'))

      const result = await createImageUploadUrl({
        filename: 'test.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
      })

      expect(result.success).toBe(false)
    })
  })

  describe('validation', () => {
    it('returns error for invalid file type', async () => {
      const result = await createImageUploadUrl({
        filename: 'archive.zip',
        contentType: 'application/zip',
        sizeBytes: 1000,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid file type')
    })

    it('accepts valid image types', async () => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

      for (const type of validTypes) {
        mockModule.__reset()

        const result = await createImageUploadUrl({
          filename: 'test.jpg',
          contentType: type,
          sizeBytes: 1000,
        })

        expect(result.success).toBe(true)
      }
    })

    it('returns error for file too large', async () => {
      const result = await createImageUploadUrl({
        filename: 'large.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 11 * 1024 * 1024, // 11MB
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('File too large')
    })

    it('accepts file at maximum size', async () => {
      const result = await createImageUploadUrl({
        filename: 'max.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 10 * 1024 * 1024, // 10MB
      })

      expect(result.success).toBe(true)
    })

    it('rejects zero-byte and negative sizes', async () => {
      const zero = await createImageUploadUrl({
        filename: 'empty.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 0,
      })
      expect(zero.success).toBe(false)

      const negative = await createImageUploadUrl({
        filename: 'bogus.jpg',
        contentType: 'image/jpeg',
        sizeBytes: -1,
      })
      expect(negative.success).toBe(false)
    })
  })

  describe('document uploads', () => {
    it('accepts PDF files', async () => {
      const result = await createImageUploadUrl({
        filename: 'document.pdf',
        contentType: 'application/pdf',
        sizeBytes: 2000,
      })

      expect(result.success).toBe(true)
    })

    it('accepts Word documents', async () => {
      const result = await createImageUploadUrl({
        filename: 'report.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: 3000,
      })

      expect(result.success).toBe(true)
    })

    it('accepts Excel spreadsheets', async () => {
      const result = await createImageUploadUrl({
        filename: 'data.xlsx',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: 4000,
      })

      expect(result.success).toBe(true)
    })

    it('returns descriptive error for unsupported types', async () => {
      const result = await createImageUploadUrl({
        filename: 'archive.zip',
        contentType: 'application/zip',
        sizeBytes: 1000,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid file type')
      expect(result.error).toContain('Allowed:')
    })
  })

  describe('signed URL minting', () => {
    it('returns a signed upload URL with a generated storage path', async () => {
      const result = await createImageUploadUrl({
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
        folder: 'events',
      })

      expect(result.success).toBe(true)
      if (result.success && result.data) {
        expect(result.data.signedUrl).toBe('https://example.com/signed-upload-url')
        expect(result.data.uploadToken).toBe('signed-token')
        expect(result.data.storagePath).toMatch(/^events\/\d+-[a-z0-9]+\.jpg$/)
        expect(result.data.publicUrl).toBe('https://example.com/image.jpg')
      }
      expect(mockModule.__createSignedUploadUrlMock).toHaveBeenCalledTimes(1)
    })

    it('accepts the cue-sheets folder', async () => {
      const result = await createImageUploadUrl({
        filename: 'route-cuesheet.pdf',
        contentType: 'application/pdf',
        sizeBytes: 2000,
        folder: 'cue-sheets',
      })

      expect(result.success).toBe(true)
      if (result.success && result.data) {
        expect(result.data.storagePath).toMatch(/^cue-sheets\//)
      }
    })

    it('rejects an invalid folder name', async () => {
      const result = await createImageUploadUrl({
        filename: 'test.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
        folder: 'not-a-folder',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid folder')
    })

    it('defaults to general folder when not specified', async () => {
      const result = await createImageUploadUrl({
        filename: 'test.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
      })

      expect(result.success).toBe(true)
      if (result.success && result.data) {
        expect(result.data.storagePath).toMatch(/^general\//)
      }
    })

    it('handles signed URL minting failure', async () => {
      mockModule.__mockSignError({ message: 'Storage error' })

      const result = await createImageUploadUrl({
        filename: 'test.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 1000,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })
})

describe('confirmImageUpload', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
    requireAdminMock.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      name: 'Test Admin',
    })
  })

  it('rejects non-admin callers', async () => {
    requireAdminMock.mockRejectedValueOnce(new Error('Not authorized'))

    const result = await confirmImageUpload({
      storagePath: 'events/123-abc.jpg',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1000,
      altText: null,
    })

    expect(result.success).toBe(false)
  })

  it('rejects invalid storage paths', async () => {
    const result = await confirmImageUpload({
      storagePath: '../../etc/passwd',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1000,
      altText: null,
    })

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/invalid storage path/i)
  })

  it('inserts the images row and returns metadata on success', async () => {
    mockModule.__mockDbInsertSuccess()

    const result = await confirmImageUpload({
      storagePath: 'events/123-abc.jpg',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1000,
      altText: 'Event photo',
    })

    expect(result.success).toBe(true)
    if (result.success && result.data) {
      expect(result.data.id).toBe('image-1')
      expect(result.data.filename).toBe('photo.jpg')
      expect(result.data.altText).toBe('Event photo')
      expect(result.data.contentType).toBe('image/jpeg')
      expect(result.data.sizeBytes).toBe(1000)
      expect(result.data.storagePath).toBe('events/123-abc.jpg')
      expect(result.data.url).toBe('https://example.com/image.jpg')
    }
  })

  it('removes the uploaded file when database insert fails', async () => {
    mockModule.__mockDbInsertError({
      code: '23505',
      message: 'duplicate key',
    })

    const result = await confirmImageUpload({
      storagePath: 'events/123-abc.jpg',
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 1000,
      altText: null,
    })

    expect(result.success).toBe(false)
    expect(mockModule.__removeMock).toHaveBeenCalledWith(['events/123-abc.jpg'])
  })
})
