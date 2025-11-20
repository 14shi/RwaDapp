import { toast } from "@/hooks/use-toast";
import { AlertCircle, WifiOff, Lock, Ban, AlertTriangle, XCircle } from "lucide-react";

/**
 * Error codes matching backend
 */
export enum ErrorCode {
  // Client errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  BAD_REQUEST = 'BAD_REQUEST',
  
  // Business logic errors
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  ASSET_NOT_MINTED = 'ASSET_NOT_MINTED',
  ASSET_NOT_FRAGMENTED = 'ASSET_NOT_FRAGMENTED',
  NO_TOKENS_AVAILABLE = 'NO_TOKENS_AVAILABLE',
  NO_REVENUE_TO_DISTRIBUTE = 'NO_REVENUE_TO_DISTRIBUTE',
  ORACLE_NOT_ENABLED = 'ORACLE_NOT_ENABLED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  EXPIRED_NONCE = 'EXPIRED_NONCE',
  
  // Blockchain errors
  BLOCKCHAIN_CONNECTION_ERROR = 'BLOCKCHAIN_CONNECTION_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  CONTRACT_CALL_FAILED = 'CONTRACT_CALL_FAILED',
  WALLET_CONNECTION_ERROR = 'WALLET_CONNECTION_ERROR',
  NETWORK_MISMATCH = 'NETWORK_MISMATCH',
  GAS_ESTIMATION_FAILED = 'GAS_ESTIMATION_FAILED',
  
  // Server errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

/**
 * Error response format from API
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: any;
    timestamp: string;
    requestId?: string;
  };
}

/**
 * Custom application error class
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: any;
  public readonly isRetryable: boolean;
  public readonly userMessage: string;

  constructor(
    message: string,
    code: ErrorCode,
    details?: any,
    isRetryable = false,
    userMessage?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.isRetryable = isRetryable;
    this.userMessage = userMessage || message;
  }
}

/**
 * Error message mappings for user-friendly display
 */
const USER_FRIENDLY_MESSAGES: Record<ErrorCode, string> = {
  // Client errors
  [ErrorCode.VALIDATION_ERROR]: 'Please check your input and try again',
  [ErrorCode.AUTHENTICATION_ERROR]: 'Please connect your wallet to continue',
  [ErrorCode.AUTHORIZATION_ERROR]: 'You don\'t have permission to perform this action',
  [ErrorCode.NOT_FOUND]: 'The requested item could not be found',
  [ErrorCode.CONFLICT]: 'This action conflicts with the current state',
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please try again later',
  [ErrorCode.BAD_REQUEST]: 'Invalid request. Please check your input',
  
  // Business logic errors
  [ErrorCode.INSUFFICIENT_FUNDS]: 'Insufficient funds to complete this transaction',
  [ErrorCode.ASSET_NOT_MINTED]: 'This asset needs to be minted first',
  [ErrorCode.ASSET_NOT_FRAGMENTED]: 'This asset needs to be fractionalized first',
  [ErrorCode.NO_TOKENS_AVAILABLE]: 'No tokens are available for purchase',
  [ErrorCode.NO_REVENUE_TO_DISTRIBUTE]: 'No revenue available to distribute',
  [ErrorCode.ORACLE_NOT_ENABLED]: 'Oracle service is not enabled for this asset',
  [ErrorCode.INVALID_SIGNATURE]: 'Invalid signature. Please try again',
  [ErrorCode.EXPIRED_NONCE]: 'Request expired. Please try again',
  
  // Blockchain errors
  [ErrorCode.BLOCKCHAIN_CONNECTION_ERROR]: 'Unable to connect to blockchain. Please check your connection',
  [ErrorCode.TRANSACTION_FAILED]: 'Transaction failed. Please try again',
  [ErrorCode.CONTRACT_CALL_FAILED]: 'Smart contract operation failed',
  [ErrorCode.WALLET_CONNECTION_ERROR]: 'Unable to connect to your wallet',
  [ErrorCode.NETWORK_MISMATCH]: 'Please switch to the correct network',
  [ErrorCode.GAS_ESTIMATION_FAILED]: 'Unable to estimate gas. Please try again',
  
  // Server errors
  [ErrorCode.INTERNAL_SERVER_ERROR]: 'Something went wrong. Please try again later',
  [ErrorCode.DATABASE_ERROR]: 'Database error. Please try again later',
  [ErrorCode.EXTERNAL_SERVICE_ERROR]: 'External service is unavailable',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable. Please try again later',
};

/**
 * Get icon component for error code
 */
function getErrorIcon(code: ErrorCode) {
  switch (code) {
    case ErrorCode.AUTHENTICATION_ERROR:
    case ErrorCode.AUTHORIZATION_ERROR:
      return Lock;
    case ErrorCode.BLOCKCHAIN_CONNECTION_ERROR:
    case ErrorCode.WALLET_CONNECTION_ERROR:
    case ErrorCode.NETWORK_MISMATCH:
      return WifiOff;
    case ErrorCode.VALIDATION_ERROR:
    case ErrorCode.BAD_REQUEST:
      return AlertCircle;
    case ErrorCode.INSUFFICIENT_FUNDS:
    case ErrorCode.NO_TOKENS_AVAILABLE:
      return Ban;
    case ErrorCode.INTERNAL_SERVER_ERROR:
    case ErrorCode.DATABASE_ERROR:
    case ErrorCode.SERVICE_UNAVAILABLE:
      return XCircle;
    default:
      return AlertTriangle;
  }
}

/**
 * Determine if error is retryable
 */
function isRetryableError(code: ErrorCode): boolean {
  const retryableCodes = [
    ErrorCode.SERVICE_UNAVAILABLE,
    ErrorCode.EXTERNAL_SERVICE_ERROR,
    ErrorCode.BLOCKCHAIN_CONNECTION_ERROR,
    ErrorCode.TRANSACTION_FAILED,
    ErrorCode.GAS_ESTIMATION_FAILED,
    ErrorCode.EXPIRED_NONCE,
  ];
  
  return retryableCodes.includes(code);
}

/**
 * Parse error from various sources
 */
export function parseError(error: any): AppError {
  // Already an AppError
  if (error instanceof AppError) {
    return error;
  }

  // API error response
  if (error?.error?.code) {
    const apiError = error as ErrorResponse;
    return new AppError(
      apiError.error.message,
      apiError.error.code,
      apiError.error.details,
      isRetryableError(apiError.error.code),
      USER_FRIENDLY_MESSAGES[apiError.error.code]
    );
  }

  // Ethereum/MetaMask errors
  if (error?.code === 4001) {
    return new AppError(
      'Transaction rejected by user',
      ErrorCode.AUTHORIZATION_ERROR,
      error,
      false,
      'Transaction cancelled'
    );
  }

  if (error?.code === -32002) {
    return new AppError(
      'Wallet request pending',
      ErrorCode.WALLET_CONNECTION_ERROR,
      error,
      true,
      'Please check your wallet for pending requests'
    );
  }

  if (error?.code === 'NETWORK_ERROR' || error?.code === 'ETIMEDOUT') {
    return new AppError(
      'Network connection error',
      ErrorCode.BLOCKCHAIN_CONNECTION_ERROR,
      error,
      true,
      'Connection error. Please check your network'
    );
  }

  // Fetch errors
  if (error?.status === 401) {
    return new AppError(
      'Authentication required',
      ErrorCode.AUTHENTICATION_ERROR,
      error,
      false,
      'Please connect your wallet to continue'
    );
  }

  if (error?.status === 403) {
    return new AppError(
      'Access denied',
      ErrorCode.AUTHORIZATION_ERROR,
      error,
      false,
      'You don\'t have permission to perform this action'
    );
  }

  if (error?.status === 404) {
    return new AppError(
      'Resource not found',
      ErrorCode.NOT_FOUND,
      error,
      false,
      'The requested item could not be found'
    );
  }

  if (error?.status >= 500) {
    return new AppError(
      error?.message || 'Server error',
      ErrorCode.INTERNAL_SERVER_ERROR,
      error,
      true,
      'Something went wrong. Please try again later'
    );
  }

  // Default error
  return new AppError(
    error?.message || 'An unexpected error occurred',
    ErrorCode.INTERNAL_SERVER_ERROR,
    error,
    false,
    'Something went wrong. Please try again'
  );
}

/**
 * Enhanced API request with error handling
 */
export async function apiRequest<T = any>(
  url: string,
  options?: RequestInit
): Promise<T> {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      credentials: 'include',
    });

    const data = await response.json();

    if (!response.ok || data.success === false) {
      throw parseError(data);
    }

    return data.data || data;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    // Network errors
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      throw new AppError(
        'Network error',
        ErrorCode.BLOCKCHAIN_CONNECTION_ERROR,
        error,
        true,
        'Unable to connect to server. Please check your connection'
      );
    }

    throw parseError(error);
  }
}

/**
 * Error toast configuration
 */
interface ToastErrorOptions {
  title?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

/**
 * Show error toast with appropriate styling
 */
export function showErrorToast(error: any, options?: ToastErrorOptions) {
  const appError = parseError(error);
  const Icon = getErrorIcon(appError.code);
  
  const title = options?.title || 'Error';
  const description = appError.userMessage;
  
  // Log error for debugging
  console.error('[Error]', {
    code: appError.code,
    message: appError.message,
    details: appError.details,
  });

  // Note: action prop requires a ReactElement, not a plain object
  // If you need action functionality, import ToastAction from "@/components/ui/toast"
  // and create a proper ReactElement
  toast({
    variant: "destructive",
    title,
    description,
    duration: options?.duration || 5000,
  });
}

/**
 * Show success toast
 */
export function showSuccessToast(message: string, description?: string) {
  toast({
    title: message,
    description,
    duration: 3000,
  });
}

/**
 * Retry mechanism for retryable errors
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: AppError | undefined;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = parseError(error);
      
      if (!lastError.isRetryable || i === maxRetries - 1) {
        throw lastError;
      }
      
      // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
  
  throw lastError;
}

/**
 * Error logging for production
 */
export function logError(error: any, context?: Record<string, any>) {
  const appError = parseError(error);
  
  // In production, send to error tracking service
  if (process.env.NODE_ENV === 'production') {
    // Example: Sentry, LogRocket, etc.
    console.error('[Production Error]', {
      timestamp: new Date().toISOString(),
      code: appError.code,
      message: appError.message,
      details: appError.details,
      context,
      userAgent: navigator.userAgent,
      url: window.location.href,
    });
  } else {
    // Development logging
    console.error('[Development Error]', {
      error: appError,
      context,
      stack: appError.stack,
    });
  }
}

/**
 * Hook for handling async operations with error handling
 */
export function useErrorHandler() {
  const handleError = (error: any, options?: ToastErrorOptions) => {
    showErrorToast(error, options);
    logError(error);
  };

  const executeWithErrorHandling = async <T,>(
    operation: () => Promise<T>,
    options?: ToastErrorOptions & { retry?: boolean }
  ): Promise<T | undefined> => {
    try {
      if (options?.retry) {
        return await retryOperation(operation);
      }
      return await operation();
    } catch (error) {
      handleError(error, options);
      return undefined;
    }
  };

  return {
    handleError,
    executeWithErrorHandling,
  };
}