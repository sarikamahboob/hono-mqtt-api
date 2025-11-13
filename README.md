# MQTT Authentication System - Architecture & Data Flow

## Table of Contents
1. [System Overview](#system-overview)
2. [Prerequisites](#prerequisites)
3. [Architecture Components](#architecture-components)
4. [Data Flow](#data-flow)
5. [Authentication Flow](#authentication-flow)
6. [ACL (Access Control List) System](#acl-access-control-list-system)
7. [API Endpoints](#api-endpoints)
8. [MQTT Topics & Permissions](#mqtt-topics--permissions)
9. [Troubleshooting](#troubleshooting)

---

## System Overview

This is a **Hono-based REST API** that manages MQTT users and integrates with **Mosquitto MQTT Broker** using **MongoDB** as the authentication backend.

```
┌─────────────────┐
│   REST Client   │
│  (curl/Postman) │
└────────┬────────┘
         │ HTTP Requests
         ▼
┌─────────────────┐
│   Hono API      │
│  (Port 3000)    │
│  - User Mgmt    │
│  - MQTT Publish │
└────────┬────────┘
         │
         │ Reads/Writes
         ▼
┌─────────────────┐         ┌──────────────────┐
│    MongoDB      │◄────────┤   Mosquitto      │
│  (Port 27017)   │  Auth   │   MQTT Broker    │
│  - users        │  Check  │   (Port 1883)    │
│  - acls         │         │   (Port 9001 WS) │
└─────────────────┘         └────────┬─────────┘
                                     │
                                     │ MQTT Protocol
                                     ▼
                            ┌──────────────────┐
                            │  MQTT Clients    │
                            │  - Publishers    │
                            │  - Subscribers   │
                            └──────────────────┘
```

---

## Prerequisites

### Software Requirements
- **Docker & Docker Compose** (v2.0+)
- **Node.js** (v18+) with npm
- **MongoDB** (via Docker)
- **Mosquitto** with go-auth plugin (via Docker)

### Node.js Dependencies
```json
{
  "hono": "^4.x",
  "mongodb": "^6.x",
  "bcryptjs": "^2.x",
  "jsonwebtoken": "^9.x",
  "mqtt": "^5.x"
}
```

### Docker Services
- **MongoDB**: Authentication database (no auth mode for development)
- **Mosquitto**: MQTT broker with go-auth plugin

---

## Architecture Components

### 1. **Hono API Server** (Node.js)
- **Port**: 3000
- **Purpose**: 
  - User management (create/read/update/delete MQTT users)
  - Admin authentication (JWT tokens)
  - MQTT message publishing via API
  - Connection testing

### 2. **MongoDB Database**
- **Port**: 27017
- **Database**: `mqtt_auth`
- **Collections**:
  - `users`: Stores MQTT user credentials and ACLs
  - `acls`: (Optional) Separate ACL storage

**User Schema**:
```javascript
{
  username: String,
  password: String,        // bcrypt hashed
  superuser: Boolean,      // true = full access, false = ACL restricted
  acls: [
    {
      topic: String,       // MQTT topic pattern (e.g., "sensors/#")
      acc: Number          // Access level (1=read, 2=write, 3=both)
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

### 3. **Mosquitto MQTT Broker**
- **Port 1883**: MQTT TCP
- **Port 9001**: MQTT WebSockets
- **Auth Plugin**: mosquitto-go-auth
- **Features**:
  - User authentication via MongoDB
  - ACL enforcement
  - Topic-based access control

---

## Data Flow

### Scenario 1: Publishing via REST API → MQTT Subscribers

```
Step 1: Client authenticates with API
┌─────────┐
│ Client  │ POST /api/users/login
└────┬────┘ Body: {"username":"admin","password":"admin123"}
     │
     ▼
┌─────────┐
│Hono API │ → Checks MongoDB users collection
└────┬────┘ → Validates password (bcrypt)
     │    → Generates JWT token
     ▼
   Returns JWT token


Step 2: Client publishes message via API
┌─────────┐
│ Client  │ POST /api/mqtt/publish
└────┬────┘ Headers: Authorization: Bearer <JWT>
     │     Body: {"topic":"sensors/temp","payload":"25°C"}
     ▼
┌─────────┐
│Hono API │ → Validates JWT
└────┬────┘ → Creates MQTT client connection
     │
     ▼
┌───────────┐
│ Mosquitto │ → Receives publish from API
└─────┬─────┘ → Authenticates API's MQTT credentials (admin/admin123)
      │       → Checks if admin can publish to "sensors/temp"
      │       → Forwards message to subscribers
      ▼
┌─────────────┐
│ Subscribers │ → device001 subscribed to "sensors/#"
└─────────────┘ → Receives: "sensors/temp: 25°C"
```

### Scenario 2: Direct MQTT Client Communication

```
Publisher                  Mosquitto                   Subscriber
    │                          │                           │
    │ 1. Connect               │                           │
    ├─────────────────────────►│                           │
    │   username: device001    │                           │
    │   password: device123    │                           │
    │                          │ 2. Check MongoDB          │
    │                          ├──────────►┌──────────┐    │
    │                          │           │ MongoDB  │    │
    │                          │◄──────────┤          │    │
    │ 3. Connected             │           └──────────┘    │
    │◄─────────────────────────┤                           │
    │                          │                           │
    │                          │    4. Connect             │
    │                          │◄──────────────────────────┤
    │                          │    username: admin        │
    │                          │    password: admin123     │
    │                          │ 5. Auth Check             │
    │                          ├──────────►MongoDB         │
    │                          │◄──────────                │
    │                          │ 6. Connected              │
    │                          ├──────────────────────────►│
    │                          │                           │
    │ 7. Publish               │                           │
    ├─────────────────────────►│ 8. ACL Check:             │
    │ Topic: sensors/temp      │    Can device001 publish  │
    │ Payload: "25°C"          │    to sensors/temp?       │
    │                          │                           │
    │                          │ 9. Forward if allowed     │
    │                          ├──────────────────────────►│
    │                          │                           │
```

---

## Authentication Flow

### 1. **REST API Authentication** (JWT)

```javascript
// Login Request
POST /api/users/login
Body: {
  "username": "admin",
  "password": "admin123"
}

// API Flow:
1. Extract username/password
2. Query MongoDB: db.users.findOne({username: "admin"})
3. Compare password using bcrypt.compare(password, user.password)
4. Generate JWT: jwt.sign({username, role}, SECRET, {expiresIn: '7d'})
5. Return token

// Response:
{
  "token": "eyJhbGc...",
  "user": {
    "username": "admin",
    "superuser": true
  }
}
```

### 2. **MQTT Authentication** (via Mosquitto)

```
Client connects to Mosquitto
       ↓
Mosquitto go-auth plugin intercepts
       ↓
Queries MongoDB: db.users.findOne({username: "device001"})
       ↓
Compares password using bcrypt
       ↓
If valid:
  - Loads user's ACLs
  - Grants connection
  - Caches credentials
Else:
  - Rejects connection
```

---

## ACL (Access Control List) System

### Permission Codes

| acc Value | Permission | Description |
|-----------|------------|-------------|
| 1 | READ | Subscribe only |
| 2 | WRITE | Publish only |
| 3 | READ+WRITE | Subscribe and Publish |
| 4 | SUBSCRIBE | Alternative subscribe code (plugin-specific) |

### ACL Examples

**Example 1: Device with limited access**
```javascript
{
  username: "device001",
  superuser: false,
  acls: [
    { topic: "devices/device001/#", acc: 3 },  // Full access to own device
    { topic: "sensors/#", acc: 1 }             // Read-only to sensors
  ]
}
```
✅ Can subscribe: `sensors/#`, `devices/device001/#`
✅ Can publish: `devices/device001/status`
❌ Cannot publish: `sensors/temperature`

**Example 2: Admin with full access**
```javascript
{
  username: "admin",
  superuser: true,  // Bypasses ALL ACL checks
  acls: []
}
```
✅ Can do ANYTHING on ANY topic

### Topic Wildcards

| Pattern | Matches |
|---------|---------|
| `sensors/temperature` | Only this exact topic |
| `sensors/+` | `sensors/temperature`, `sensors/humidity` (single level) |
| `sensors/#` | `sensors/temperature`, `sensors/temp/room1` (multi-level) |
| `#` | ALL topics |

---

## API Endpoints

### User Management

#### 1. Login (Get JWT Token)
```bash
POST /api/users/login
Content-Type: application/json

Body:
{
  "username": "admin",
  "password": "admin123"
}

Response:
{
  "token": "eyJhbGc...",
  "user": {
    "username": "admin",
    "superuser": true
  }
}
```

#### 2. Create MQTT User
```bash
POST /api/users
Authorization: Bearer <JWT>
Content-Type: application/json

Body:
{
  "username": "device002",
  "password": "device456",
  "superuser": false,
  "acls": [
    { "topic": "devices/device002/#", "acc": 3 },
    { "topic": "sensors/#", "acc": 1 }
  ]
}

Response:
{
  "message": "User created successfully",
  "userId": "...",
  "username": "device002"
}
```

#### 3. List All Users
```bash
GET /api/users
Authorization: Bearer <JWT>

Response:
{
  "users": [
    {
      "_id": "...",
      "username": "admin",
      "superuser": true,
      "acls": []
    },
    {
      "_id": "...",
      "username": "device001",
      "superuser": false,
      "acls": [...]
    }
  ]
}
```

#### 4. Get Single User
```bash
GET /api/users/:username
Authorization: Bearer <JWT>

Response:
{
  "_id": "...",
  "username": "device001",
  "superuser": false,
  "acls": [...]
}
```

#### 5. Update User
```bash
PUT /api/users/:username
Authorization: Bearer <JWT>
Content-Type: application/json

Body:
{
  "password": "newpassword",  // Optional
  "superuser": false,         // Optional
  "acls": [...]              // Optional
}
```

#### 6. Delete User
```bash
DELETE /api/users/:username
Authorization: Bearer <JWT>
```

### MQTT Operations

#### 7. Publish Message
```bash
POST /api/mqtt/publish
Authorization: Bearer <JWT>
Content-Type: application/json

Body:
{
  "topic": "sensors/temperature",
  "payload": "{\"value\": 25, \"unit\": \"celsius\"}",
  "qos": 0,
  "retain": false
}

Response:
{
  "message": "Published successfully",
  "topic": "sensors/temperature",
  "payload": "..."
}
```

#### 8. Test MQTT Connection
```bash
POST /api/mqtt/test-connection
Authorization: Bearer <JWT>
Content-Type: application/json

Body:
{
  "username": "device001",
  "password": "device123"
}

Response (Success):
{
  "message": "Connection successful",
  "connected": true
}

Response (Failure):
{
  "error": "Connection timeout",
  "connected": false
}
```

---

## MQTT Topics & Permissions

### Common Topic Structure

```
devices/
  ├─ device001/
  │  ├─ status          (device publishes status)
  │  ├─ data            (device publishes sensor data)
  │  └─ commands        (server publishes commands)
  └─ device002/
     └─ ...

sensors/
  ├─ temperature
  ├─ humidity
  └─ pressure

actuators/
  ├─ lights
  └─ motors

system/
  ├─ alerts
  └─ logs
```

### Permission Examples

| User | Topics | Access | Use Case |
|------|--------|--------|----------|
| admin | `#` | 3 (Full) | System administrator |
| device001 | `devices/device001/#` | 3 | Own device control |
| device001 | `sensors/#` | 1 | Read sensor data |
| dashboard | `#` | 1 | Monitor everything |
| controller | `actuators/#` | 2 | Send commands only |

---

## Troubleshooting

### Issue 1: "Connection timeout" when testing MQTT

**Symptoms:**
```bash
curl /api/mqtt/test-connection
→ {"error": "Connection timeout"}
```

**Causes:**
- Mosquitto not running
- MongoDB not accessible by Mosquitto
- User doesn't exist in MongoDB

**Solutions:**
```bash
# Check containers
docker compose ps

# Check Mosquitto logs
docker compose logs mosquitto --tail 50

# Verify user exists
docker compose exec mongodb mongosh mqtt_auth --eval "db.users.find()"

# Restart Mosquitto
docker compose restart mosquitto
```

### Issue 2: "All subscription requests were denied"

**Symptoms:**
```bash
mosquitto_sub -u device001 -P device123 -t "sensors/#"
→ All subscription requests were denied.
```

**Causes:**
- User's ACL doesn't include the requested topic
- ACL `acc` value incorrect

**Solutions:**
```bash
# Check user's ACLs
docker compose exec mongodb mongosh mqtt_auth --eval \
  "db.users.findOne({username: 'device001'}, {acls: 1})"

# Update ACL to grant access
# Update in MongoDB or via API
```

### Issue 3: MongoDB authentication failed

**Symptoms:**
```
Mongo get user error: authentication failed
```

**Causes:**
- MongoDB has authentication enabled
- Mosquitto config has wrong credentials
- Mismatch between MongoDB auth mode and Mosquitto config

**Solution:**
Ensure `mosquitto.conf` and `docker-compose.yaml` match:

**Option A: No Auth (Development)**
```yaml
# docker-compose.yaml
command: mongod --noauth
```
```conf
# mosquitto.conf
auth_opt_mongo_host mongodb
auth_opt_mongo_port 27017
auth_opt_mongo_dbname mqtt_auth
# NO username/password lines
```

**Option B: With Auth (Production)**
```yaml
# docker-compose.yaml
environment:
  MONGO_INITDB_ROOT_USERNAME: admin
  MONGO_INITDB_ROOT_PASSWORD: admin123
# Remove --noauth
```
```conf
# mosquitto.conf
auth_opt_mongo_host mongodb
auth_opt_mongo_port 27017
auth_opt_mongo_dbname mqtt_auth
auth_opt_mongo_username admin
auth_opt_mongo_password admin123
auth_opt_mongo_auth_source admin
```

### Issue 4: User authenticated but ACL denied

**Symptoms:**
```
✅ user device001 authenticated
❌ Acl is false for user device001
```

**Causes:**
- ACL `acc` value may need to be 4 instead of 1 for subscribe
- Topic pattern doesn't match

**Solution:**
Try different `acc` values or check mosquitto-go-auth documentation

---

## Quick Start Commands

### Start the system
```bash
# Start Docker services
docker compose up -d

# Start Hono API
npm run dev
```

### Create initial admin user
```bash
# Manual MongoDB insert
docker compose exec mongodb mongosh mqtt_auth --eval '
db.users.insertOne({
  username: "admin",
  password: "$2b$10$/MifGZ//IP55KD/Q4AwliO1PbUk/RyEWZ/HaMscXw329GoENvwqx6",
  superuser: true,
  acls: [],
  createdAt: new Date(),
  updatedAt: new Date()
})'
```

### Test MQTT connection
```bash
# Subscribe as admin
mosquitto_sub -h localhost -p 1883 -u admin -P admin123 -t "#" -v

# Publish test message
mosquitto_pub -h localhost -p 1883 -u admin -P admin123 -t "test/topic" -m "Hello MQTT"
```

---

## Environment Variables

Create `.env` file:
```env
# API
PORT=3000
JWT_SECRET=your-secret-key-change-in-production

# MongoDB
MONGODB_URI=mongodb://localhost:27017
DB_NAME=mqtt_auth

# MQTT
MQTT_BROKER=mqtt://localhost:1883
```

---

## Security Considerations

### Development Mode ⚠️
- MongoDB: `--noauth` (no authentication)
- Suitable for: Local testing only

### Production Mode 🔒
- MongoDB: Enable authentication
- Use strong passwords
- Enable TLS/SSL for MQTT
- Use environment variables for secrets
- Rotate JWT secrets regularly
- Implement rate limiting

---

## Additional Resources

- [Mosquitto Documentation](https://mosquitto.org/documentation/)
- [mosquitto-go-auth GitHub](https://github.com/iegomez/mosquitto-go-auth)
- [MQTT Protocol](https://mqtt.org/)
- [Hono Framework](https://hono.dev/)

