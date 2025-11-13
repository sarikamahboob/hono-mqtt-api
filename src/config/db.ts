import { MongoClient, Db } from 'mongodb';

const MONGODB_URI = 'mongodb://localhost:27017';
const DB_NAME = 'mqtt_auth';

let db: Db | null = null;

export async function connectDB() {
  if (db) return db;
  
  const client = await MongoClient.connect(MONGODB_URI);
  db = client.db(DB_NAME);
  console.log('✅ Connected to MongoDB');
  return db;
}

export function getDB(): Db {
  if (!db) throw new Error('Database not initialized');
  return db;
}