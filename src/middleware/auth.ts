import { Context, Next } from 'hono';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '../models/type';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this';

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    c.set('user', decoded);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
}

export function generateToken(username: string, role: string): string {
  return jwt.sign({ username, role }, JWT_SECRET, { expiresIn: '7d' });
}