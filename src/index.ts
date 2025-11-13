import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { connectDB } from './config/db';
import users from './routes/user';
import acls from './routes/acls';
import mqttRoutes from './routes/mqtt';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());

// Health check
app.get('/', (c) => {
  return c.json({
    message: 'MQTT Hono API Server',
    version: '1.0.0',
    endpoints: {
      users: '/api/users',
      acls: '/api/acls',
      mqtt: '/api/mqtt'
    }
  });
});

// Routes
app.route('/api/users', users);
app.route('/api/acls', acls);
app.route('/api/mqtt', mqttRoutes);

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await connectDB();
    
    serve({
      fetch: app.fetch,
      port: PORT as number
    });

    console.log(`🚀 Hono server running on http://localhost:${PORT}`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();