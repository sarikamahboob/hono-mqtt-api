import { Hono } from 'hono';
import mqtt from 'mqtt';
import { authMiddleware } from '../middleware/auth';
import { MQTTMessage } from '../models/type';

const mqttRoutes = new Hono();

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';

// Publish message to MQTT topic
mqttRoutes.post('/publish', authMiddleware, async (c) => {
  const { topic, payload, qos = 0, retain = false } = await c.req.json();

  if (!topic || payload === undefined) {
    return c.json({ error: 'Topic and payload are required' }, 400);
  }

  return new Promise((resolve) => {
    const client = mqtt.connect(MQTT_BROKER, {
      username: 'admin', // Use admin credentials or from request
      password: 'admin123'
    });

    client.on('connect', () => {
      client.publish(topic, payload, { qos, retain }, (err) => {
        client.end();
        
        if (err) {
          resolve(c.json({ error: 'Failed to publish message' }, 500));
        } else {
          resolve(c.json({ 
            message: 'Published successfully',
            topic,
            payload 
          }));
        }
      });
    });

    client.on('error', (err) => {
      client.end();
      resolve(c.json({ error: err.message }, 500));
    });
  });
});

// Test MQTT connection
mqttRoutes.post('/test-connection', authMiddleware, async (c) => {
  const { username, password } = await c.req.json();

  return new Promise((resolve) => {
    const client = mqtt.connect(MQTT_BROKER, {
      username,
      password,
      clientId: `test_${Date.now()}`
    });

    let timeout = setTimeout(() => {
      client.end();
      resolve(c.json({ error: 'Connection timeout' }, 408));
    }, 5000);

    client.on('connect', () => {
      clearTimeout(timeout);
      client.end();
      resolve(c.json({ message: 'Connection successful', connected: true }));
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      client.end();
      resolve(c.json({ error: err.message, connected: false }, 401));
    });
  });
});

export default mqttRoutes;