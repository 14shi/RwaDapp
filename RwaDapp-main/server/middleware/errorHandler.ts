import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { log } from '../vite';

/**
 * Standard error codes for the application
 */
export enum ErrorCode {
  // Client errors (4xx)
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
  
  // Server errors (5xx)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

/**
 * Standard error response format
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
 * Success response format for consistency
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

/**
 * Base application error class
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: any;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    code: ErrorCode,
    details?: any,
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    
    // Maintains proper stack trace
    Error.captureStackTrace(this, this.constructor);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Specific error classes for different scenarios
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, ErrorCode.AUTHENTICATION_ERROR);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, ErrorCode.AUTHORIZATION_ERROR);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, ErrorCode.NOT_FOUND, { resource });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 409, ErrorCode.CONFLICT, details);
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string, code: ErrorCode, details?: any) {
    super(message, 400, code, details);
  }
}

export class BlockchainError extends AppError {
  constructor(message: string, code: ErrorCode, details?: any) {
    super(message, 503, code, details);
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', details?: any) {
    super(message, 500, ErrorCode.DATABASE_ERROR, details, false);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, originalError?: any) {
    super(
      `External service error: ${service}`,
      503,
      ErrorCode.EXTERNAL_SERVICE_ERROR,
      { service, originalError },
      false
    );
  }
}

/**
 * Convert various error types to AppError
 */
export function normalizeError(error: any): AppError {
  // Already an AppError
  if (error instanceof AppError) {
    return error;
  }

  // Zod validation error
  if (error instanceof ZodError) {
    return new ValidationError('Invalid request data', {
      errors: error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code,
      })),
    });
  }

  // Blockchain/Ethers errors
  if (error?.code === 'CALL_EXCEPTION' || error?.code === 'NETWORK_ERROR') {
    return new BlockchainError(
      error.message || 'Blockchain operation failed',
      ErrorCode.CONTRACT_CALL_FAILED,
      { originalError: error }
    );
  }

  if (error?.code === 'INSUFFICIENT_FUNDS') {
    return new BusinessLogicError(
      'Insufficient funds for transaction',
      ErrorCode.INSUFFICIENT_FUNDS,
      { originalError: error }
    );
  }

  // Database errors (simplified check - expand based on your DB)
  if (error?.code === 'ECONNREFUSED' || error?.code === 'ETIMEDOUT') {
    return new DatabaseError('Database connection failed', { originalError: error });
  }

  // Default to internal server error
  return new AppError(
    error?.message || 'An unexpected error occurred',
    500,
    ErrorCode.INTERNAL_SERVER_ERROR,
    { originalError: error },
    false
  );
}

/**
 * Generate a unique request ID for tracking
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Global error handling middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = generateRequestId();
  const appError = normalizeError(err);
  
  // Log error details for debugging
  const logMessage = {
    requestId,
    method: req.method,
    path: req.path,
    statusCode: appError.statusCode,
    errorCode: appError.code,
    message: appError.message,
    ...(appError.isOperational ? {} : { stack: appError.stack }),
    ...(appError.details ? { details: appError.details } : {}),
  };

  // Log based on severity
  if (!appError.isOperational || appError.statusCode >= 500) {
    console.error('[ERROR]', JSON.stringify(logMessage, null, 2));
    log(`ERROR: ${req.method} ${req.path} - ${appError.code}: ${appError.message}`);
  } else {
    console.warn('[WARNING]', JSON.stringify(logMessage, null, 2));
    log(`WARN: ${req.method} ${req.path} - ${appError.code}: ${appError.message}`);
  }

  // Send error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(process.env.NODE_ENV === 'development' && appError.details ? { details: appError.details } : {}),
      timestamp: new Date().toISOString(),
      requestId,
    },
  };

  res.status(appError.statusCode).json(errorResponse);
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Helper to send success responses
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: any
): Response {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    ...(meta ? { meta: { ...meta, timestamp: new Date().toISOString() } } : {}),
  };
  
  return res.status(statusCode).json(response);
}

/**
 * Helper to throw standardized errors
 */
export const ErrorHelper = {
  notFound: (resource: string) => {
    throw new NotFoundError(resource);
  },
  
  validation: (message: string, details?: any) => {
    throw new ValidationError(message, details);
  },
  
  unauthorized: (message?: string) => {
    throw new AuthenticationError(message);
  },
  
  forbidden: (message?: string) => {
    throw new AuthorizationError(message);
  },
  
  conflict: (message: string, details?: any) => {
    throw new ConflictError(message, details);
  },
  
  businessLogic: (message: string, code: ErrorCode, details?: any) => {
    throw new BusinessLogicError(message, code, details);
  },
  
  blockchain: (message: string, code: ErrorCode, details?: any) => {
    throw new BlockchainError(message, code, details);
  },
  
  database: (message?: string, details?: any) => {
    throw new DatabaseError(message, details);
  },
  
  externalService: (service: string, originalError?: any) => {
    throw new ExternalServiceError(service, originalError);
  },
};