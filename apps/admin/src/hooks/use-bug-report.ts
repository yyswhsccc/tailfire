import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type BugReportType = 'bug' | 'feature' | 'question'

interface BugReportPayload {
  title: string
  description: string
  type: BugReportType
  pageUrl: string
  userAgent: string
  consoleLogs?: string
  autoScreenshot?: Blob | null
  manualScreenshots?: File[]
}

interface BugReportResponse {
  issueUrl: string
  issueNumber: number
}

export function useBugReport() {
  return useMutation({
    mutationFn: async (payload: BugReportPayload): Promise<BugReportResponse> => {
      const formData = new FormData()
      formData.append('title', payload.title)
      formData.append('description', payload.description)
      formData.append('type', payload.type)
      formData.append('pageUrl', payload.pageUrl)
      formData.append('userAgent', payload.userAgent)
      if (payload.consoleLogs) {
        formData.append('consoleLogs', payload.consoleLogs)
      }

      if (payload.autoScreenshot) {
        formData.append('screenshots', payload.autoScreenshot, 'auto-screenshot.png')
      }

      if (payload.manualScreenshots) {
        for (const file of payload.manualScreenshots) {
          formData.append('screenshots', file, file.name)
        }
      }

      return api.postFormData<BugReportResponse>('/bug-reports', formData)
    },
  })
}
