import { db } from '../../db/connection';
import { users } from '../../db/schema';
import { eq } from 'drizzle-orm';
import argon2 from 'argon2';
import { jwtUtil, JWTUtil } from '../../utils/jwt';
import { logger } from '../../config/logger';
import type { RegisterInput, LoginInput, AuthResponse } from './auth.types';
import { AppError } from '../../utils/errors';

export class AuthService {
  private readonly jwtUtil: JWTUtil;

  constructor(jwt: JWTUtil = jwtUtil) {
    this.jwtUtil = jwt;
  }

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

    const [result] = await db
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

    const user = {
      id: result.id,
      email: result.email,
      name: result.name,
      createdAt: result.createdAt,
    }
    logger.info({ userId: user.id, email: user.email }, 'User registered');

    const accessToken = this.jwtUtil.generateAccessToken({ sub: user.id, email: user.email });
    const refreshToken = this.jwtUtil.generateRefreshToken({ sub: user.id, email: user.email });

    return { accessToken, refreshToken, user };
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const [result] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (!result) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    const user = {
      id: result.id,
      email: result.email,
      name: result.name,
      createdAt: result.createdAt,
    }

    const isValidPassword = await argon2.verify(result.passwordHash, input.password);
    if (!isValidPassword) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }

    logger.info({ userId: user.id }, 'User logged in');

    const accessToken = this.jwtUtil.generateAccessToken({ sub: user.id, email: user.email });
    const refreshToken = this.jwtUtil.generateRefreshToken({ sub: user.id, email: user.email });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
    };
  }

  async getMe(userId: string): Promise<{ id: string; email: string; name: string; createdAt: Date }> {
    const [result] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!result) {
      throw new AppError('USER_NOT_FOUND', 'User not found', 404);
    }

    return {
      id: result.id,
      email: result.email,
      name: result.name,
      createdAt: result.createdAt,
    };
  }

}

export const authService = new AuthService();
