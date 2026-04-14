/**
 * @vitest-environment happy-dom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CueSheetField } from '@/components/admin/cue-sheet-field'

const mockCreateImageUploadUrl = vi.fn()
const mockConfirmImageUpload = vi.fn()

vi.mock('@/lib/actions/images', () => ({
  createImageUploadUrl: (...args: unknown[]) => mockCreateImageUploadUrl(...args),
  confirmImageUpload: (...args: unknown[]) => mockConfirmImageUpload(...args),
}))

vi.mock('@/lib/supabase-browser', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        uploadToSignedUrl: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('CueSheetField', () => {
  const mockOnChange = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when no value is set', () => {
    it('renders URL input and upload button', () => {
      render(<CueSheetField value="" onChange={mockOnChange} />)

      expect(screen.getByLabelText('Cue Sheet')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('https://example.com/cuesheet.pdf')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /upload pdf/i })).toBeInTheDocument()
    })

    it('shows helper text', () => {
      render(<CueSheetField value="" onChange={mockOnChange} />)

      expect(screen.getByText(/upload a pdf or paste a url/i)).toBeInTheDocument()
    })

    it('calls onChange when URL is typed', async () => {
      const user = userEvent.setup()
      render(<CueSheetField value="" onChange={mockOnChange} />)

      const input = screen.getByPlaceholderText('https://example.com/cuesheet.pdf')
      await user.type(input, 'https://example.com/test.pdf')

      expect(mockOnChange).toHaveBeenCalled()
    })

    it('disables inputs when disabled prop is true', () => {
      render(<CueSheetField value="" onChange={mockOnChange} disabled />)

      expect(screen.getByPlaceholderText('https://example.com/cuesheet.pdf')).toBeDisabled()
      expect(screen.getByRole('button', { name: /upload pdf/i })).toBeDisabled()
    })
  })

  describe('when a value is set', () => {
    const testUrl = 'https://storage.example.com/cue-sheets/test.pdf'

    it('shows the URL as a link', () => {
      render(<CueSheetField value={testUrl} onChange={mockOnChange} />)

      const link = screen.getByText(testUrl)
      expect(link).toBeInTheDocument()
      expect(link.closest('a')).toHaveAttribute('href', testUrl)
      expect(link.closest('a')).toHaveAttribute('target', '_blank')
    })

    it('shows a view link', () => {
      render(<CueSheetField value={testUrl} onChange={mockOnChange} />)

      const viewLink = screen.getByLabelText('View cue sheet')
      expect(viewLink).toHaveAttribute('href', testUrl)
    })

    it('shows a remove button', () => {
      render(<CueSheetField value={testUrl} onChange={mockOnChange} />)

      expect(screen.getByLabelText('Remove cue sheet')).toBeInTheDocument()
    })

    it('calls onChange with empty string when remove is clicked', async () => {
      const user = userEvent.setup()
      render(<CueSheetField value={testUrl} onChange={mockOnChange} />)

      await user.click(screen.getByLabelText('Remove cue sheet'))

      expect(mockOnChange).toHaveBeenCalledWith('')
    })

    it('does not show the URL input or helper text', () => {
      render(<CueSheetField value={testUrl} onChange={mockOnChange} />)

      expect(
        screen.queryByPlaceholderText('https://example.com/cuesheet.pdf')
      ).not.toBeInTheDocument()
      expect(screen.queryByText(/upload a pdf or paste a url/i)).not.toBeInTheDocument()
    })
  })

  describe('file upload validation', () => {
    it('rejects non-PDF files', async () => {
      render(<CueSheetField value="" onChange={mockOnChange} />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['content'], 'image.png', { type: 'image/png' })

      fireEvent.change(fileInput, { target: { files: [file] } })

      expect(await screen.findByText('Only PDF files are allowed')).toBeInTheDocument()
      expect(mockCreateImageUploadUrl).not.toHaveBeenCalled()
    })

    it('rejects files over 10MB', async () => {
      render(<CueSheetField value="" onChange={mockOnChange} />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File([''], 'large.pdf', { type: 'application/pdf' })
      Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 })

      fireEvent.change(fileInput, { target: { files: [file] } })

      expect(await screen.findByText(/file too large/i)).toBeInTheDocument()
      expect(mockCreateImageUploadUrl).not.toHaveBeenCalled()
    })
  })

  describe('successful upload', () => {
    it('calls onChange with the public URL after upload', async () => {
      const publicUrl = 'https://storage.example.com/cue-sheets/123-abc.pdf'

      mockCreateImageUploadUrl.mockResolvedValueOnce({
        success: true,
        data: {
          signedUrl: 'https://example.com/signed-url',
          uploadToken: 'token-123',
          storagePath: 'cue-sheets/123-abc.pdf',
          publicUrl,
        },
      })

      mockConfirmImageUpload.mockResolvedValueOnce({
        success: true,
        data: {
          id: 'img-1',
          url: publicUrl,
          storagePath: 'cue-sheets/123-abc.pdf',
          filename: 'route.pdf',
          altText: null,
          contentType: 'application/pdf',
          sizeBytes: 5000,
        },
      })

      render(<CueSheetField value="" onChange={mockOnChange} />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['pdf content'], 'route.pdf', { type: 'application/pdf' })

      fireEvent.change(fileInput, { target: { files: [file] } })

      // Wait for the async upload flow to complete
      await vi.waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith(publicUrl)
      })

      expect(mockCreateImageUploadUrl).toHaveBeenCalledWith({
        filename: 'route.pdf',
        contentType: 'application/pdf',
        sizeBytes: expect.any(Number),
        folder: 'cue-sheets',
      })
    })
  })
})
