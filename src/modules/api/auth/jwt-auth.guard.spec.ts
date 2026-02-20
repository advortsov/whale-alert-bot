import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { describe, it, expect, beforeEach } from 'vitest';

import { JwtAuthGuard } from './jwt-auth.guard';

const JWT_SECRET = 'test-jwt-secret';

function createMockContext(authHeader?: string): {
  context: { switchToHttp: () => { getRequest: () => Record<string, unknown> } };
  request: Record<string, unknown>;
} {
  const request: Record<string, unknown> = {
    headers: { authorization: authHeader },
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
  return { context, request };
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService({ secret: JWT_SECRET });
    guard = new JwtAuthGuard(jwtService);
  });

  it('should allow valid access token and set user on request', () => {
    const token = jwtService.sign({ sub: '42', username: 'whale', type: 'access' });
    const { context, request } = createMockContext(`Bearer ${token}`);

    const result = guard.canActivate(context as any);

    expect(result).toBe(true);
    expect(request['user']).toEqual({ telegramId: '42', username: 'whale' });
  });

  it('should throw on missing authorization header', () => {
    const { context } = createMockContext(undefined);

    expect(() => guard.canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('should throw on invalid token', () => {
    const { context } = createMockContext('Bearer invalid-token');

    expect(() => guard.canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('should reject refresh token used as access', () => {
    const token = jwtService.sign({ sub: '42', username: 'whale', type: 'refresh' });
    const { context } = createMockContext(`Bearer ${token}`);

    expect(() => guard.canActivate(context as any)).toThrow(UnauthorizedException);
  });

  it('should throw on non-Bearer scheme', () => {
    const token = jwtService.sign({ sub: '42', username: 'whale', type: 'access' });
    const { context } = createMockContext(`Basic ${token}`);

    expect(() => guard.canActivate(context as any)).toThrow(UnauthorizedException);
  });
});
