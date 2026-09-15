import { Prisma } from '../generated/prisma/client.js';

export const PrismaErrorCode = {
  UniqueViolation: 'P2002',
  ForeignKeyViolation: 'P2003',
  RecordNotFound: 'P2025',
} as const;

export function isPrismaError(
  error: unknown,
  code: (typeof PrismaErrorCode)[keyof typeof PrismaErrorCode],
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}
