# Performance Testing Guide

## Overview

Performance testing for the NyumbaSync backend API to ensure it meets production requirements for response times, throughput, and scalability.

## Test Types

### 1. Load Testing
- Simulate normal expected load
- Measure response times under typical usage
- Identify baseline performance metrics

### 2. Stress Testing
- Push system beyond normal capacity
- Find breaking points
- Test recovery mechanisms

### 3. Spike Testing
- Sudden traffic increases
- Test auto-scaling capabilities
- Verify system stability

### 4. Endurance Testing
- Sustained load over time
- Identify memory leaks
- Test long-running stability

## Tools

### Recommended Tools
1. **Artillery** - Modern load testing toolkit
2. **Apache JMeter** - Comprehensive testing tool
3. **k6** - Developer-friendly load testing
4. **autocannon** - Fast HTTP benchmarking

## Performance Targets

### Response Time Targets (95th percentile)
- **Authentication endpoints**: < 200ms
- **Read operations**: < 100ms
- **Write operations**: < 300ms
- **Search/Filter**: < 500ms
- **File uploads**: < 2s (for 5MB files)

### Throughput Targets
- **Concurrent users**: 1,000+
- **Requests per second**: 500+
- **Database connections**: 100 pool size

### Resource Limits
- **CPU usage**: < 70% under normal load
- **Memory usage**: < 2GB per instance
- **Database connections**: < 80% of pool

## Test Scenarios

### Scenario 1: Authentication Flow
```
1. User signup (POST /api/v1/auth/signup)
2. User login (POST /api/v1/auth/login)
3. Get current user (GET /api/v1/auth/me)
4. Logout (POST /api/v1/auth/logout)
```

### Scenario 2: Property Search
```
1. Login
2. Search properties (GET /api/v1/properties?location=Nairobi)
3. Get property details (GET /api/v1/properties/:id)
4. Filter by price (GET /api/v1/properties?minPrice=10000&maxPrice=50000)
```

### Scenario 3: Maintenance Request
```
1. Login as tenant
2. Create maintenance request (POST /api/v1/maintenance)
3. Upload photo (POST /api/v1/documents)
4. Check status (GET /api/v1/maintenance/:id)
```

### Scenario 4: Messaging
```
1. Login
2. Send message (POST /api/v1/messages)
3. Get conversations (GET /api/v1/messages/conversations)
4. Mark as read (PUT /api/v1/messages/:id/read)
```

## Running Tests

### Install Artillery
```bash
npm install -g artillery
```

### Run Basic Load Test
```bash
artillery run tests/performance/load-test.yml
```

### Run Stress Test
```bash
artillery run tests/performance/stress-test.yml
```

### Generate Report
```bash
artillery run --output report.json tests/performance/load-test.yml
artillery report report.json
```

## Metrics to Monitor

### Application Metrics
- Response time (min, max, median, p95, p99)
- Requests per second
- Error rate
- Success rate

### System Metrics
- CPU usage
- Memory usage
- Disk I/O
- Network I/O

### Database Metrics
- Query execution time
- Connection pool usage
- Slow queries
- Lock contention

## Performance Optimization Tips

### Backend
1. Enable response compression (gzip)
2. Implement caching (Redis)
3. Use database indexes
4. Optimize queries (avoid N+1)
5. Use connection pooling
6. Implement pagination
7. Use CDN for static assets

### Database
1. Add proper indexes
2. Optimize slow queries
3. Use read replicas
4. Implement query caching
5. Regular maintenance (VACUUM, ANALYZE)

### Infrastructure
1. Use load balancer
2. Enable auto-scaling
3. Use CDN
4. Implement rate limiting
5. Monitor and alert

## Continuous Performance Testing

### CI/CD Integration
```yaml
# .github/workflows/performance.yml
name: Performance Tests
on:
  schedule:
    - cron: '0 2 * * *'  # Daily at 2 AM
  workflow_dispatch:

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run performance tests
        run: |
          npm install -g artillery
          artillery run tests/performance/load-test.yml
```

## Baseline Metrics (To Be Established)

| Endpoint | Method | Target (p95) | Current | Status |
|----------|--------|--------------|---------|--------|
| /auth/signup | POST | 200ms | TBD | ⏳ |
| /auth/login | POST | 200ms | TBD | ⏳ |
| /auth/me | GET | 100ms | TBD | ⏳ |
| /properties | GET | 100ms | TBD | ⏳ |
| /properties/:id | GET | 100ms | TBD | ⏳ |
| /maintenance | POST | 300ms | TBD | ⏳ |
| /messages | POST | 200ms | TBD | ⏳ |

## Next Steps

1. ✅ Create performance test suite
2. ⏳ Establish baseline metrics
3. ⏳ Run load tests
4. ⏳ Identify bottlenecks
5. ⏳ Optimize and retest
6. ⏳ Set up monitoring
7. ⏳ Integrate with CI/CD
