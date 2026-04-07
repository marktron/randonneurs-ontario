/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the underlying libraries before importing the module under test
vi.mock('browser-image-compression', () => ({
  default: vi.fn(),
}))

vi.mock('heic2any', () => ({
  default: vi.fn(),
}))

import imageCompression from 'browser-image-compression'
import heic2any from 'heic2any'
import { compressImageForUpload } from '@/lib/image-compression'

const mockedCompression = vi.mocked(imageCompression)
const mockedHeic2any = vi.mocked(heic2any)

function createMockFile(name: string, type: string, size: number): File {
  const file = new File([''], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('compressImageForUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedCompression.mockResolvedValue(createMockFile('compressed.jpg', 'image/jpeg', 500_000))
    mockedHeic2any.mockResolvedValue(new Blob([new Uint8Array(400_000)], { type: 'image/jpeg' }))
  })

  describe('pass-through cases', () => {
    it('returns PDF files unchanged', async () => {
      const pdf = createMockFile('doc.pdf', 'application/pdf', 1_000_000)
      const result = await compressImageForUpload(pdf)
      expect(result).toBe(pdf)
      expect(mockedCompression).not.toHaveBeenCalled()
    })

    it('returns Word documents unchanged', async () => {
      const docx = createMockFile(
        'report.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        2_000_000
      )
      const result = await compressImageForUpload(docx)
      expect(result).toBe(docx)
      expect(mockedCompression).not.toHaveBeenCalled()
    })

    it('returns GPX files unchanged', async () => {
      const gpx = createMockFile('ride.gpx', 'application/gpx+xml', 100_000)
      const result = await compressImageForUpload(gpx)
      expect(result).toBe(gpx)
      expect(mockedCompression).not.toHaveBeenCalled()
    })

    it('returns GIF files unchanged (preserves animation)', async () => {
      const gif = createMockFile('cat.gif', 'image/gif', 800_000)
      const result = await compressImageForUpload(gif)
      expect(result).toBe(gif)
      expect(mockedCompression).not.toHaveBeenCalled()
    })

    it('returns small JPEG files unchanged', async () => {
      const small = createMockFile('thumb.jpg', 'image/jpeg', 200_000) // 200 KB
      const result = await compressImageForUpload(small)
      expect(result).toBe(small)
      expect(mockedCompression).not.toHaveBeenCalled()
    })
  })

  describe('compression', () => {
    it('compresses a large JPEG with the default options', async () => {
      const large = createMockFile('photo.jpg', 'image/jpeg', 5_000_000) // 5 MB

      const result = await compressImageForUpload(large)

      expect(mockedCompression).toHaveBeenCalledTimes(1)
      expect(mockedCompression).toHaveBeenCalledWith(large, {
        maxWidthOrHeight: 2400,
        maxSizeMB: 2,
        initialQuality: 0.85,
        useWebWorker: true,
        fileType: 'image/jpeg',
      })
      expect(result.type).toBe('image/jpeg')
    })

    it('compresses a large PNG', async () => {
      const png = createMockFile('screenshot.png', 'image/png', 4_000_000)
      await compressImageForUpload(png)
      expect(mockedCompression).toHaveBeenCalledTimes(1)
    })

    it('compresses a large WebP', async () => {
      const webp = createMockFile('image.webp', 'image/webp', 3_000_000)
      await compressImageForUpload(webp)
      expect(mockedCompression).toHaveBeenCalledTimes(1)
    })

    it('honours custom CompressOptions overrides', async () => {
      const large = createMockFile('photo.jpg', 'image/jpeg', 5_000_000)

      await compressImageForUpload(large, {
        maxWidthOrHeight: 1600,
        maxSizeMB: 1,
        quality: 0.75,
      })

      expect(mockedCompression).toHaveBeenCalledWith(large, {
        maxWidthOrHeight: 1600,
        maxSizeMB: 1,
        initialQuality: 0.75,
        useWebWorker: true,
        fileType: 'image/jpeg',
      })
    })
  })

  describe('HEIC conversion', () => {
    it('converts HEIC to JPEG and then compresses', async () => {
      const heic = createMockFile('IMG_1234.heic', 'image/heic', 3_500_000)

      const result = await compressImageForUpload(heic)

      expect(mockedHeic2any).toHaveBeenCalledTimes(1)
      expect(mockedHeic2any).toHaveBeenCalledWith({
        blob: heic,
        toType: 'image/jpeg',
        quality: 0.92,
      })
      // After HEIC conversion the working file is JPEG, then compression runs
      expect(mockedCompression).toHaveBeenCalledTimes(1)
      const passedFile = mockedCompression.mock.calls[0][0] as File
      expect(passedFile.type).toBe('image/jpeg')
      expect(passedFile.name).toBe('IMG_1234.jpg')
      expect(result.type).toBe('image/jpeg')
    })

    it('converts HEIF to JPEG and then compresses', async () => {
      const heif = createMockFile('photo.heif', 'image/heif', 3_500_000)

      await compressImageForUpload(heif)

      expect(mockedHeic2any).toHaveBeenCalledTimes(1)
      expect(mockedCompression).toHaveBeenCalledTimes(1)
      const passedFile = mockedCompression.mock.calls[0][0] as File
      expect(passedFile.type).toBe('image/jpeg')
      expect(passedFile.name).toBe('photo.jpg')
    })

    it('handles heic2any returning an array of blobs', async () => {
      mockedHeic2any.mockResolvedValueOnce([
        new Blob([new Uint8Array(400_000)], { type: 'image/jpeg' }),
      ])
      const heic = createMockFile('IMG_5678.heic', 'image/heic', 3_500_000)

      await compressImageForUpload(heic)

      expect(mockedCompression).toHaveBeenCalledTimes(1)
    })
  })

  describe('pre-check', () => {
    it('rejects files larger than 25 MB before touching any decoder', async () => {
      const huge = createMockFile('insane.jpg', 'image/jpeg', 30 * 1024 * 1024) // 30 MB

      await expect(compressImageForUpload(huge)).rejects.toThrow(/too large/i)
      expect(mockedCompression).not.toHaveBeenCalled()
      expect(mockedHeic2any).not.toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('re-throws a friendly error when browser-image-compression fails', async () => {
      mockedCompression.mockRejectedValueOnce(new Error('decode failed'))
      const large = createMockFile('photo.jpg', 'image/jpeg', 5_000_000)

      await expect(compressImageForUpload(large)).rejects.toThrow(/couldn.?t process this image/i)
    })

    it('re-throws a friendly error when heic2any fails', async () => {
      mockedHeic2any.mockRejectedValueOnce(new Error('not actually heic'))
      const heic = createMockFile('IMG_9999.heic', 'image/heic', 3_500_000)

      await expect(compressImageForUpload(heic)).rejects.toThrow(/couldn.?t process this image/i)
    })
  })
})
