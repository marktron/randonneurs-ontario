import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for image upload actions.
 *
 * These tests focus on:
 * 1. File validation (type, size)
 * 2. Upload success/failure
 * 3. Database error handling
 * 4. Cleanup on failure
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
  const uploadMock = vi.fn().mockResolvedValue({ error: null })
  const removeMock = vi.fn().mockResolvedValue({ error: null })
  const getPublicUrlMock = vi.fn().mockReturnValue({
    data: { publicUrl: 'https://example.com/image.jpg' },
  })

  const storageBucketMock = {
    upload: uploadMock,
    remove: removeMock,
    getPublicUrl: getPublicUrlMock,
  }

  return {
    getSupabaseAdmin: vi.fn(() => ({
      from: vi.fn(() => queryBuilder),
      storage: {
        from: vi.fn(() => storageBucketMock),
      },
    })),
    __queryBuilder: queryBuilder,
    __uploadMock: uploadMock,
    __removeMock: removeMock,
    __reset: () => {
      queryBuilder.single.mockReset()
      queryBuilder.single.mockResolvedValue({
        data: { id: 'image-1' },
        error: null,
      })
      uploadMock.mockReset()
      uploadMock.mockResolvedValue({ error: null })
      removeMock.mockReset()
      removeMock.mockResolvedValue({ error: null })
    },
    __mockUploadSuccess: () => {
      uploadMock.mockResolvedValueOnce({ error: null })
    },
    __mockUploadError: (error: unknown) => {
      uploadMock.mockResolvedValueOnce({ error })
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

vi.mock('@/lib/auth/get-admin', () => ({
  requireAdmin: vi
    .fn()
    .mockResolvedValue({ id: 'admin-1', email: 'admin@test.com', name: 'Test Admin' }),
}))

// Import after mocks
import { uploadImage } from '@/lib/actions/images'

const mockModule = await vi.importMock<{
  __queryBuilder: Record<string, ReturnType<typeof vi.fn>>
  __uploadMock: ReturnType<typeof vi.fn>
  __removeMock: ReturnType<typeof vi.fn>
  __reset: () => void
  __mockUploadSuccess: () => void
  __mockUploadError: (error: unknown) => void
  __mockDbInsertSuccess: () => void
  __mockDbInsertError: (error: unknown) => void
}>('@/lib/supabase-server')

// Helper to create a mock File
function createMockFile(name: string, type: string, size: number): File {
  const file = new File([''], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('uploadImage', () => {
  beforeEach(() => {
    mockModule.__reset()
    vi.clearAllMocks()
  })

  describe('validation', () => {
    it('returns error when no file provided', async () => {
      const formData = new FormData()

      const result = await uploadImage(formData)

      expect(result.success).toBe(false)
      expect(result.error).toBe('No file provided')
    })

    it('returns error for invalid file type', async () => {
      const formData = new FormData()
      const file = createMockFile('test.zip', 'application/zip', 1000)
      formData.append('file', file)

      const result = await uploadImage(formData)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid file type')
    })

    it('accepts valid image types', async () => {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

      for (const type of validTypes) {
        mockModule.__reset()
        const formData = new FormData()
        const file = createMockFile('test.jpg', type, 1000)
        formData.append('file', file)

        mockModule.__mockUploadSuccess()
        mockModule.__mockDbInsertSuccess()

        const result = await uploadImage(formData)

        expect(result.success).toBe(true)
      }
    })

    it('returns error for file too large', async () => {
      const formData = new FormData()
      const file = createMockFile('large.jpg', 'image/jpeg', 11 * 1024 * 1024) // 11MB
      formData.append('file', file)

      const result = await uploadImage(formData)

      expect(result.success).toBe(false)
      expect(result.error).toContain('File too large')
    })

    it('accepts file at maximum size', async () => {
      const formData = new FormData()
      const file = createMockFile('max.jpg', 'image/jpeg', 10 * 1024 * 1024) // 10MB
      formData.append('file', file)

      mockModule.__mockUploadSuccess()
      mockModule.__mockDbInsertSuccess()

      const result = await uploadImage(formData)

      expect(result.success).toBe(true)
    })
  })

  describe('upload flow', () => {
    it('uploads image successfully', async () => {
      const formData = new FormData()
      const file = createMockFile('test.jpg', 'image/jpeg', 1000)
      formData.append('file', file)
      formData.append('altText', 'Test image')
      formData.append('folder', 'events')

      mockModule.__mockUploadSuccess()
      mockModule.__mockDbInsertSuccess()

      const result = await uploadImage(formData)

      expect(result.success).toBe(true)
      if (result.success && result.data) {
        expect(result.data).toBeDefined()
        expect(result.data.url).toBeDefined()
        expect(result.data.filename).toBe('test.jpg')
        expect(result.data.altText).toBe('Test image')
      }
    })

    it('handles upload failure', async () => {
      const formData = new FormData()
      const file = createMockFile('test.jpg', 'image/jpeg', 1000)
      formData.append('file', file)

      mockModule.__mockUploadError({
        message: 'Storage error',
      })

      const result = await uploadImage(formData)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('cleans up uploaded file when database insert fails', async () => {
      const formData = new FormData()
      const file = createMockFile('test.jpg', 'image/jpeg', 1000)
      formData.append('file', file)

      mockModule.__mockUploadSuccess()
      mockModule.__mockDbInsertError({
        code: '23505',
        message: 'duplicate key',
      })

      const result = await uploadImage(formData)

      expect(result.success).toBe(false)
      expect(mockModule.__removeMock).toHaveBeenCalled()
    })

    it('handles database errors', async () => {
      const formData = new FormData()
      const file = createMockFile('test.jpg', 'image/jpeg', 1000)
      formData.append('file', file)

      mockModule.__mockUploadSuccess()
      mockModule.__mockDbInsertError({
        code: '23505',
        message: 'duplicate key',
      })

      const result = await uploadImage(formData)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })
  })

  describe('file naming', () => {
    it('generates unique filename with timestamp', async () => {
      const formData = new FormData()
      const file = createMockFile('original.jpg', 'image/jpeg', 1000)
      formData.append('file', file)

      mockModule.__mockUploadSuccess()
      mockModule.__mockDbInsertSuccess()

      const result = await uploadImage(formData)

      expect(result.success).toBe(true)
      if (result.success && result.data) {
        // Storage path uses generated unique name: folder/timestamp-randomid.ext
        expect(result.data.storagePath).toMatch(/^general\/\d+-[a-z0-9]+\.jpg$/)
        // Original filename is preserved in the filename field
        expect(result.data.filename).toBe('original.jpg')
      }
    })

    it('uses folder parameter in storage path', async () => {
      const formData = new FormData()
      const file = createMockFile('test.jpg', 'image/jpeg', 1000)
      formData.append('file', file)
      formData.append('folder', 'custom-folder')

      mockModule.__mockUploadSuccess()
      mockModule.__mockDbInsertSuccess()

      const result = await uploadImage(formData)

      expect(result.success).toBe(true)
      if (result.success && result.data) {
        expect(result.data.storagePath).toContain('custom-folder/')
      }
    })

    it('defaults to general folder when not specified', async () => {
      const formData = new FormData()
      const file = createMockFile('test.jpg', 'image/jpeg', 1000)
      formData.append('file', file)

      mockModule.__mockUploadSuccess()
      mockModule.__mockDbInsertSuccess()

      const result = await uploadImage(formData)

      expect(result.success).toBe(true)
      if (result.success && result.data) {
        expect(result.data.storagePath).toContain('general/')
      }
    })
  })

  describe('document uploads', () => {
    it('accepts PDF files', async () => {
      const formData = new FormData()
      const file = createMockFile('document.pdf', 'application/pdf', 2000)
      formData.append('file', file)

      mockModule.__mockUploadSuccess()
      mockModule.__mockDbInsertSuccess()

      const result = await uploadImage(formData)

      expect(result.success).toBe(true)
      if (result.success && result.data) {
        expect(result.data.filename).toBe('document.pdf')
        expect(result.data.contentType).toBe('application/pdf')
      }
    })

    it('accepts Word documents', async () => {
      const formData = new FormData()
      const file = createMockFile(
        'report.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        3000
      )
      formData.append('file', file)

      mockModule.__mockUploadSuccess()
      mockModule.__mockDbInsertSuccess()

      const result = await uploadImage(formData)

      expect(result.success).toBe(true)
      if (result.success && result.data) {
        expect(result.data.filename).toBe('report.docx')
      }
    })

    it('accepts Excel spreadsheets', async () => {
      const formData = new FormData()
      const file = createMockFile(
        'data.xlsx',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        4000
      )
      formData.append('file', file)

      mockModule.__mockUploadSuccess()
      mockModule.__mockDbInsertSuccess()

      const result = await uploadImage(formData)

      expect(result.success).toBe(true)
      if (result.success && result.data) {
        expect(result.data.filename).toBe('data.xlsx')
      }
    })

    it('returns descriptive error for unsupported types', async () => {
      const formData = new FormData()
      const file = createMockFile('archive.zip', 'application/zip', 1000)
      formData.append('file', file)

      const result = await uploadImage(formData)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid file type')
      expect(result.error).toContain('Allowed:')
    })
  })
})
