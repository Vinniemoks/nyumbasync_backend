# 🚀 Starting NyumbaSync Backend for Development

## Prerequisites

Before starting the backend, make sure you have:

1. **Node.js** (v18 or higher)
   ```bash
   node --version
   ```

2. **MongoDB** running locally
   ```bash
   # Check if MongoDB is running
   mongosh
   # Or start MongoDB service
   # Windows: net start MongoDB
   # Mac: brew services start mongodb-community
   # Linux: sudo systemctl start mongod
   ```

3. **Dependencies installed**
   ```bash
   cd nyumbasync_backend
   npm install
   ```

## Quick Start

### Option 1: Development Mode with Auto-Reload (Recommended)
```bash
cd nyumbasync_backend
npm run dev
```

This uses **nodemon** which automatically restarts the server when you make changes to the code.

### Option 2: Standard Start
```bash
cd nyumbasync_backend
npm start
```

This runs the server normally without auto-reload.

### Option 3: Single Process Mode (No Clustering)
```bash
cd nyumbasync_backend
npm run start:single
```

Useful for debugging - runs in single process mode.

## Verify Server is Running

Once started, you should see:
```
✅ Connected to MongoDB
✅ Auth routes registered at /api/v1/auth
✅ Property routes registered at /api/v1/properties
...
🚀 Server running on port 3001
```

### Test the Server

1. **Health Check**
   ```bash
   curl http://localhost:3001/health
   ```
   Or open in browser: http://localhost:3001/health

2. **API Status**
   ```bash
   curl http://localhost:3001/api/status
   ```
   Or open in browser: http://localhost:3001/api/status

3. **Root Endpoint**
   Open in browser: http://localhost:3001/

## Environment Configuration

The `.env` file has been created with development defaults. Key settings:

- **PORT**: 3001 (backend server port)
- **MONGODB_URI**: mongodb://localhost:27017/nyumbasync
- **NODE_ENV**: development
- **CLUSTER_MODE**: false (single process for easier debugging)

## Common Issues & Solutions

### Issue: "Cannot connect to MongoDB"
**Solution**: Make sure MongoDB is running
```bash
# Windows
net start MongoDB

# Mac
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Or use Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### Issue: "Port 3001 already in use"
**Solution**: Kill the process using port 3001
```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:3001 | xargs kill -9
```

Or change the port in `.env`:
```env
PORT=3002
```

### Issue: "Module not found"
**Solution**: Install dependencies
```bash
npm install
```

### Issue: "JWT_SECRET not set"
**Solution**: The `.env` file should have default secrets. If not, add:
```env
JWT_SECRET=your-secret-key-min-32-characters-long
JWT_REFRESH_SECRET=your-refresh-secret-min-32-characters
```

## Development Workflow

1. **Start MongoDB** (if not already running)
2. **Start Backend** in development mode:
   ```bash
   npm run dev
   ```
3. **Make changes** to your code
4. **Server auto-restarts** when you save files
5. **Test your changes** using:
   - Browser: http://localhost:3001
   - Postman/Insomnia
   - Mobile app (configured to use http://10.0.2.2:3001/api)

## Available Scripts

- `npm start` - Start server (production mode)
- `npm run dev` - Start with auto-reload (development mode) ⭐
- `npm run start:single` - Start without clustering
- `npm run start:cluster` - Start with clustering
- `npm test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

## API Endpoints

Once running, your API is available at:

- **Base URL**: http://localhost:3001/api/v1
- **Auth**: http://localhost:3001/api/v1/auth
- **Properties**: http://localhost:3001/api/v1/properties
- **Payments**: http://localhost:3001/api/v1/payments
- **Maintenance**: http://localhost:3001/api/v1/maintenance
- **Tenants**: http://localhost:3001/api/v1/tenant

## Connecting Mobile App

Your mobile app is already configured to connect to the backend:
- **Android Emulator**: Uses `http://10.0.2.2:3001/api`
- **iOS Simulator**: Uses `http://localhost:3001/api`
- **Physical Device**: Update to your computer's IP (e.g., `http://192.168.1.100:3001/api`)

## Logs

Server logs are saved to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only

View logs in real-time:
```bash
# Windows
type logs\combined.log

# Mac/Linux
tail -f logs/combined.log
```

## Stopping the Server

Press `Ctrl + C` in the terminal where the server is running.

## Next Steps

1. ✅ Start backend: `npm run dev`
2. ✅ Verify it's running: http://localhost:3001/health
3. ✅ Start your mobile app in Android Studio
4. ✅ Test signup/login functionality

Happy coding! 🎉
