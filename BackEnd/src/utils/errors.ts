// Error code mapping for user-friendly messages

export enum ErrorCode {
  DUPLICATE_RECEIPT = 'DUPLICATE_RECEIPT',
  BUDGET_EXHAUSTED = 'BUDGET_EXHAUSTED',
  OCR_UNREADABLE = 'OCR_UNREADABLE',
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  SUBMISSION_NOT_FOUND = 'SUBMISSION_NOT_FOUND',
  QUEST_NOT_FOUND = 'QUEST_NOT_FOUND',
  INVALID_INPUT = 'INVALID_INPUT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ErrorCode.DUPLICATE_RECEIPT]: 'Looks like this receipt was already used.',
  [ErrorCode.BUDGET_EXHAUSTED]: 'This quest ran out of funds.',
  [ErrorCode.OCR_UNREADABLE]: "We couldn't read your receipt—try a clearer photo.",
  [ErrorCode.POLICY_VIOLATION]: "This submission doesn't meet the quest requirements.",
  [ErrorCode.SUBMISSION_NOT_FOUND]: 'Submission not found.',
  [ErrorCode.QUEST_NOT_FOUND]: 'Quest not found.',
  [ErrorCode.INVALID_INPUT]: 'Invalid input provided.',
  [ErrorCode.INTERNAL_ERROR]: 'An internal error occurred. Please try again.',
};

export function getErrorMessage(code: ErrorCode): string {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrorCode.INTERNAL_ERROR];
}

export function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

export interface ApiError {
  message: string;
  code: ErrorCode;
  requestId: string;
  details?: any;
}

export function createApiError(
  code: ErrorCode,
  requestId: string,
  details?: any
): ApiError {
  return {
    message: getErrorMessage(code),
    code,
    requestId,
    details,
  };
}
