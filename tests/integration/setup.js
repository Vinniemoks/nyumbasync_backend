// Integration test setup
require('dotenv').config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global test utilities for integration tests
global.integrationUtils = {
  // Create complete user with authentication
  createAuthenticatedUser: async (app, request, userData) => {
    const response = await request(app)
      .post('/api/v1/auth/signup')
      .send(userData);
    
    return {
      user: response.body.user,
      token: response.body.token,
      userId: response.body.user.id
    };
  },
  
  // Create property with landlord
  createPropertyWithLandlord: async (app, request, landlordToken) => {
    const propertyData = {
      title: 'Integration Test Property',
      description: 'A comfortable test apartment located in the Riverside area of Nairobi, Kenya.',
      type: 'apartment',
      bedrooms: 2,
      bathrooms: 2,
      address: { street: '123 Integration St', area: 'Riverside', city: 'Nairobi', county: 'Nairobi', coordinates: { type: 'Point', coordinates: [36.8172, -1.2864] } },
      rent: { amount: 50000 },
      deposit: 50000,
      subcounty: 'Westlands'
    };

    const response = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send(propertyData);

    return response.body;
  },
  
  // Create maintenance request
  createMaintenanceRequest: async (app, request, tenantToken, propertyId) => {
    const maintenanceData = {
      title: 'Integration Test Issue',
      description: 'Test maintenance request',
      category: 'plumbing',
      priority: 'high',
      propertyId: propertyId
    };
    
    const response = await request(app)
      .post('/api/v1/tenant/maintenance')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send(maintenanceData);
    
    return response.body;
  },
  
  // Upload test document
  uploadTestDocument: async (app, request, token, filePath) => {
    const response = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', filePath)
      .field('name', 'Test Document')
      .field('category', 'personal');
    
    return response.body.document;
  },
  
  // Wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};
