import type { UseFormReturnType } from '@mantine/form'
import { ApiError } from './client'

export interface ParsedApiErrors {
  fieldErrors: Record<string, string[]>
  baseErrors: string[]
}

export function parseApiError(error: unknown): ParsedApiErrors {
  if (error instanceof ApiError && error.body && typeof error.body === 'object') {
    const { base, ...fieldErrors } = error.body as Record<string, string[]>
    return { fieldErrors, baseErrors: base ?? [] }
  }
  return {
    fieldErrors: {},
    baseErrors: [error instanceof Error ? error.message : 'Something went wrong.'],
  }
}

// Applies field-level errors onto a @mantine/form instance and returns the
// base (form-level, cross-field) errors for the caller to render separately.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyApiErrors(form: UseFormReturnType<any>, error: unknown): string[] {
  const { fieldErrors, baseErrors } = parseApiError(error)
  form.setErrors(
    Object.fromEntries(
      Object.entries(fieldErrors).map(([field, messages]) => [field, messages.join(', ')]),
    ),
  )
  return baseErrors
}
