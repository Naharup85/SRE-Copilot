import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export interface JWTPayload {
    sub: string;
    email: string;
}

export class JWTUtil {
    generateAccessToken(payload: JWTPayload) {
        return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, { expiresIn: env.ACCESS_TOKEN_EXPIRES } as jwt.SignOptions);
    }

    generateRefreshToken(payload: JWTPayload) {
        return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, { expiresIn: env.REFRESH_TOKEN_EXPIRES } as jwt.SignOptions);
    }

    verifyAccessToken(token: string) {
        return jwt.verify(token, env.ACCESS_TOKEN_SECRET);
    }

    verifyRefreshToken(token: string) {
        return jwt.verify(token, env.REFRESH_TOKEN_SECRET);
    }
}

export const jwtUtil = new JWTUtil();