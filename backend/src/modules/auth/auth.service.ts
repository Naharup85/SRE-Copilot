import { db } from '../../db/connection';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import type { RegisterInput, LoginInput, AuthResponse } from './auth.types';
import { AppError } from '../../utils/errors';

export class AuthService {
  async register(input: RegisterInput): Promise<AuthResponse> {
    // Check for existing user
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError('EMAIL_ALREADY_EXISTS', 'An account with this email already exists', 409);
    }

    const passwordHash = await argon2.hash(input.password);

    const [user] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        name: input.name,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      });

    logger.info({ userId: user.id, email: user.email }, 'User registered');

    const token = this.generateToken(user.id, user.email);

    return { token, user };
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    const isValidPassword = await argon2.verify(user.passwordHash, input.password);
    if (!isValidPassword) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    logger.info({ userId: user.id }, 'User logged in');

    const token = this.generateToken(user.id, user.email);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
    };
  }

  async getMe(userId: string): Promise<{ id: string; email: string; name: string; createdAt: Date }> {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    return user;
  }

  private generateToken(userId: string, email: string): string {
    return jwt.sign(
      { sub: userId, email },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN } as jwt.SignOptions,
    );
  }
}

export const authService = new AuthService();
