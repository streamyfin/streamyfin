/**
 * `sonner-native` for every unit spec, wired in `unitSetup.ts`. A toast is
 * drawn natively and its callers never read anything back. Every `toast`
 * function is a `jest.fn()`, so a spec asserts one with
 * `jest.mocked(toast.error)`.
 */
const toast = Object.assign(jest.fn(), {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
  loading: jest.fn(),
  promise: jest.fn(),
  dismiss: jest.fn(),
});

export const toastModule = { toast, Toaster: () => null };
