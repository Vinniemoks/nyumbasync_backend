// E2E test setup
require('dotenv').config({ path: '.env.test' });

process.env.NODE_ENV = 'test';
jest.setTimeout(60000); // 60 seconds for E2E tests

// E2E test utilities
global.e2eUtils = {
  // Simulate complete user registration and onboarding
  completeUserOnboarding: async (app, request, userType = 'tenant') => {
    const userData = {
      email: `${userType}@e2e.com`,
      password: 'Test123!',
      firstName: 'E2E',
      lastName: userType.charAt(0).toUpperCase() + userType.slice(1),
      phone: `25471234${Math.floor(Math.random() * 10000)}`,
      role: userType
    };

    const signupResponse = await request(app)
      .post('/api/v1/auth/signup')
      .send(userData);

    return {
      ...signupResponse.body,
      userData
    };
  },

  // Simulate property listing to tenant application
  propertyApplicationFlow: async (app, request, landlordToken, tenantToken) => {
    // Create property
    const property = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({
        name: 'E2E Test Property',
        address: '123 E2E St, Nairobi',
        type: 'apartment',
        units: 5,
        monthlyRent: 45000
      });

    // Tenant views property
    await request(app)
      .get(`/api/v1/properties/${property.body._id}`);

    return property.body;
  },

  // Simulate maintenance request to resolution
  maintenanceResolutionFlow: async (app, request, tenantToken, propertyId) => {
    // Submit request
    const maintenance = await request(app)
      .post('/api/v1/tenant/maintenance')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        title: 'E2E Maintenance',
        description: 'Test issue',
        category: 'plumbing',
        priority: 'high',
        propertyId
      });

    return maintenance.body;
  }
};
