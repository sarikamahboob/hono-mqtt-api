import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { authMiddleware, generateToken } from '../middleware/auth';
import { getDB } from '../config/db';
import { User } from '../models/type';

const users = new Hono();

// Admin login
users.post('/login', async (c) => {
  const { username, password } = await c.req.json();

  const db = getDB();
  const user = await db.collection('users').findOne({ username });

  if (!user) {
    return c.json({ error: 'User not found' }, 401);
  }

  let isValid = false;
  
  if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
    // Hashed password - use bcrypt
    isValid = await bcrypt.compare(password, user.password);
  } else {
    // Plain text password - direct comparison
    isValid = password === user.password;
  }

  if (!isValid) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  const token = generateToken(user.username, user.superuser ? 'admin' : 'user');

  return c.json({
    token,
    user: {
      username: user.username,
      superuser: user.superuser
    }
  });
});

// Create MQTT user
users.post('/', authMiddleware, async (c) => {
  const { username, password, superuser, acls } = await c.req.json();

  if (!username || !password) {
    return c.json({ error: 'Username and password required' }, 400);
  }

  const db = getDB();
  
  // Check if user exists
  const existingUser = await db.collection('users').findOne({ username });
  if (existingUser) {
    return c.json({ error: 'User already exists' }, 409);
  }

  // Hash password with bcrypt
  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser: User = {
    username,
    password: hashedPassword,  // Store hashed password
    superuser: superuser || false,
    acls: acls || [],
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await db.collection('users').insertOne(newUser);

  return c.json({
    message: 'User created successfully',
    userId: result.insertedId,
    username: newUser.username
  }, 201);
});

// Get all users
users.get('/', authMiddleware, async (c) => {
  const db = getDB();
  const allUsers = await db.collection('users')
    .find({}, { projection: { password: 0 } })
    .toArray();

  return c.json({ users: allUsers });
});

// Get single user
users.get('/:username', authMiddleware, async (c) => {
  const username = c.req.param('username');
  const db = getDB();
  
  const user = await db.collection('users').findOne(
    { username },
    { projection: { password: 0 } }
  );

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ user });
});

// Update user
users.put('/:username', authMiddleware, async (c) => {
  const username = c.req.param('username');
  const { password, superuser, acls } = await c.req.json();

  const db = getDB();
  const updateData: any = {
    updatedAt: new Date()
  };

  if (password) {
    updateData.password = password;
  }
  if (superuser !== undefined) {
    updateData.superuser = superuser;
  }
  if (acls) {
    updateData.acls = acls;
  }

  const result = await db.collection('users').updateOne(
    { username },
    { $set: updateData }
  );

  if (result.matchedCount === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ message: 'User updated successfully' });
});

// Delete user
users.delete('/:username', authMiddleware, async (c) => {
  const username = c.req.param('username');
  const db = getDB();

  const result = await db.collection('users').deleteOne({ username });

  if (result.deletedCount === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ message: 'User deleted successfully' });
});

export default users;