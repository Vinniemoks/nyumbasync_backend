/**
 * Simple Performance Test Script
 * Tests basic endpoints and measures response times
 * 
 * Usage: node tests/performance/simple-perf-test.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:3001';
const NUM_REQUESTS = 100;
const CONCURRENT_REQUESTS = 10;

// Test results storage
const results = {
  signup: [],
  login: [],
  getUser: [],
  properties: []
};

// Helper function to make HTTP request
function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const startTime = Date.now();
    
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      
      res.on('data', (chunk) => {
        body += chunk;
      });
      
      res.on('end', () => {
        const duration = Date.now() - startTime;
        resolve({
          statusCode: res.statusCode,
          duration,
          body: body ? JSON.parse(body) : null
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Calculate statistics
function calculateStats(times) {
  if (times.length === 0) return null;
  
  times.sort((a, b) => a - b);
  
  const sum = times.reduce((a, b) => a + b, 0);
  const mean = sum / times.length;
  const min = times[0];
  const max = times[times.length - 1];
  const median = times[Math.floor(times.length / 2)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  
  return { min, max, mean, median, p95, p99 };
}

// Test signup endpoint
async function testSignup(count) {
  console.log(`\n📝 Testing Signup (${count} requests)...`);
  const promises = [];
  
  for (let i = 0; i < count; i++) {
    const promise = makeRequest('POST', '/api/v1/auth/signup', {
      email: `perftest${Date.now()}${i}@test.com`,
      password: 'Test123!@#',
      firstName: 'Perf',
      lastName: 'Test',
      phone: `254${Math.floor(Math.random() * 900000000) + 100000000}`,
      role: 'tenant'
    }).then(res => {
      results.signup.push(res.duration);
      return res;
    }).catch(err => {
      console.error('Signup error:', err.message);
    });
    
    promises.push(promise);
    
    // Throttle requests
    if (promises.length >= CONCURRENT_REQUESTS) {
      await Promise.all(promises);
      promises.length = 0;
    }
  }
  
  await Promise.all(promises);
  
  const stats = calculateStats(results.signup);
  console.log('Signup Stats:', stats);
  console.log(`Success Rate: ${(results.signup.length / count * 100).toFixed(2)}%`);
}

// Test login endpoint
async function testLogin(count) {
  console.log(`\n🔐 Testing Login (${count} requests)...`);
  const promises = [];
  
  // Create a test user first
  const testUser = {
    email: `logintest${Date.now()}@test.com`,
    password: 'Test123!@#',
    firstName: 'Login',
    lastName: 'Test',
    phone: `254${Math.floor(Math.random() * 900000000) + 100000000}`,
    role: 'tenant'
  };
  
  await makeRequest('POST', '/api/v1/auth/signup', testUser);
  
  for (let i = 0; i < count; i++) {
    const promise = makeRequest('POST', '/api/v1/auth/login', {
      identifier: testUser.email,
      password: testUser.password
    }).then(res => {
      results.login.push(res.duration);
      return res;
    }).catch(err => {
      console.error('Login error:', err.message);
    });
    
    promises.push(promise);
    
    if (promises.length >= CONCURRENT_REQUESTS) {
      await Promise.all(promises);
      promises.length = 0;
    }
  }
  
  await Promise.all(promises);
  
  const stats = calculateStats(results.login);
  console.log('Login Stats:', stats);
  console.log(`Success Rate: ${(results.login.length / count * 100).toFixed(2)}%`);
}

// Test get current user endpoint
async function testGetUser(count) {
  console.log(`\n👤 Testing Get Current User (${count} requests)...`);
  
  // Create and login a user first
  const testUser = {
    email: `getuser${Date.now()}@test.com`,
    password: 'Test123!@#',
    firstName: 'Get',
    lastName: 'User',
    phone: `254${Math.floor(Math.random() * 900000000) + 100000000}`,
    role: 'tenant'
  };
  
  await makeRequest('POST', '/api/v1/auth/signup', testUser);
  const loginRes = await makeRequest('POST', '/api/v1/auth/login', {
    identifier: testUser.email,
    password: testUser.password
  });
  
  const token = loginRes.body.token;
  const promises = [];
  
  for (let i = 0; i < count; i++) {
    const promise = makeRequest('GET', '/api/v1/auth/me', null, {
      'Authorization': `Bearer ${token}`
    }).then(res => {
      results.getUser.push(res.duration);
      return res;
    }).catch(err => {
      console.error('Get user error:', err.message);
    });
    
    promises.push(promise);
    
    if (promises.length >= CONCURRENT_REQUESTS) {
      await Promise.all(promises);
      promises.length = 0;
    }
  }
  
  await Promise.all(promises);
  
  const stats = calculateStats(results.getUser);
  console.log('Get User Stats:', stats);
  console.log(`Success Rate: ${(results.getUser.length / count * 100).toFixed(2)}%`);
}

// Test properties endpoint
async function testProperties(count) {
  console.log(`\n🏠 Testing Properties List (${count} requests)...`);
  const promises = [];
  
  for (let i = 0; i < count; i++) {
    const promise = makeRequest('GET', '/api/v1/properties?page=1&limit=20')
      .then(res => {
        results.properties.push(res.duration);
        return res;
      }).catch(err => {
        console.error('Properties error:', err.message);
      });
    
    promises.push(promise);
    
    if (promises.length >= CONCURRENT_REQUESTS) {
      await Promise.all(promises);
      promises.length = 0;
    }
  }
  
  await Promise.all(promises);
  
  const stats = calculateStats(results.properties);
  console.log('Properties Stats:', stats);
  console.log(`Success Rate: ${(results.properties.length / count * 100).toFixed(2)}%`);
}

// Print summary
function printSummary() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 PERFORMANCE TEST SUMMARY');
  console.log('='.repeat(60));
  
  const endpoints = [
    { name: 'Signup', data: results.signup, target: 200 },
    { name: 'Login', data: results.login, target: 200 },
    { name: 'Get User', data: results.getUser, target: 100 },
    { name: 'Properties', data: results.properties, target: 100 }
  ];
  
  console.log('\nEndpoint Performance (all times in ms):');
  console.log('-'.repeat(60));
  console.log('Endpoint'.padEnd(15), 'Min'.padEnd(8), 'Mean'.padEnd(8), 'P95'.padEnd(8), 'Target'.padEnd(8), 'Status');
  console.log('-'.repeat(60));
  
  endpoints.forEach(endpoint => {
    const stats = calculateStats(endpoint.data);
    if (stats) {
      const status = stats.p95 <= endpoint.target ? '✅ PASS' : '❌ FAIL';
      console.log(
        endpoint.name.padEnd(15),
        stats.min.toFixed(0).padEnd(8),
        stats.mean.toFixed(0).padEnd(8),
        stats.p95.toFixed(0).padEnd(8),
        endpoint.target.toString().padEnd(8),
        status
      );
    }
  });
  
  console.log('\n' + '='.repeat(60));
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Performance Tests...');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Requests per endpoint: ${NUM_REQUESTS}`);
  console.log(`Concurrent requests: ${CONCURRENT_REQUESTS}`);
  
  try {
    await testSignup(NUM_REQUESTS);
    await testLogin(NUM_REQUESTS);
    await testGetUser(NUM_REQUESTS);
    await testProperties(NUM_REQUESTS);
    
    printSummary();
    
    console.log('\n✅ Performance tests completed!');
  } catch (error) {
    console.error('\n❌ Performance tests failed:', error);
    process.exit(1);
  }
}

// Run tests
runTests();
