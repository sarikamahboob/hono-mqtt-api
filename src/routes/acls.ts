import { Hono } from 'hono';
import { getDB } from '../config/db';
import { authMiddleware } from '../middleware/auth';
import { ACL } from '../models/type';

const acls = new Hono();

// Add ACL to user
acls.post('/:username', authMiddleware, async (c) => {
  const username = c.req.param('username');
  const { topic, acc } = await c.req.json();

  if (!topic || acc === undefined) {
    return c.json({ error: 'Topic and acc are required' }, 400);
  }

  const db = getDB();
  const newACL: ACL = { topic, acc };

  const result = await db.collection('users').updateOne(
    { username },
    { $push: { acls: newACL }, $set: { updatedAt: new Date() } }
  );

  if (result.matchedCount === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ message: 'ACL added successfully', acl: newACL });
});

// Remove ACL from user
acls.delete('/:username', authMiddleware, async (c) => {
  const username = c.req.param('username');
  const { topic } = await c.req.json();

  const db = getDB();
  
  const result = await db.collection('users').updateOne(
    { username },
    { $pull: { acls: { topic } }, $set: { updatedAt: new Date() } }
  );

  if (result.matchedCount === 0) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ message: 'ACL removed successfully' });
});

// Get user ACLs
acls.get('/:username', authMiddleware, async (c) => {
  const username = c.req.param('username');
  const db = getDB();

  const user = await db.collection('users').findOne(
    { username },
    { projection: { acls: 1 } }
  );

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  return c.json({ acls: user.acls || [] });
});

export default acls;