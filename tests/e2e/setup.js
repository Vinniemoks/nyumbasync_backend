// E2E test setup
require('dotenv').config({ path: '.env.test' });

process.env.NODE_ENV = 'test';
jest.setTimeout(60000); // 60 seconds for E2E tests

// Monotonic counter so each onboarded user gets a unique, VALID 12-digit
// Kenyan phone (2547XXXXXXXX). The old `Math.random()` form produced
// variable-length numbers that failed phone validation intermittently.
let e2ePhoneSeq = 100;
const nextE2ePhone = () => `2547${String(e2ePhoneSeq++).padStart(8, '0')}`;

// E2E test utilities
global.e2eUtils = {
  // Simulate complete user registration and onboarding
  completeUserOnboarding: async (app, request, userType = 'tenant') => {
    const userData = {
      email: `${userType}${e2ePhoneSeq}@e2e.com`,
      password: 'Test123!',
      firstName: 'E2E',
      lastName: userType.charAt(0).toUpperCase() + userType.slice(1),
      phone: nextE2ePhone(),
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
    // Create property using the real Property schema (title/description(50+)/
    // type/bedrooms/bathrooms/address+GeoJSON/rent.amount/deposit).
    const property = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({
        title: 'E2E Test Property',
        description: 'A comfortable test apartment located in the Riverside area of Nairobi, Kenya.',
        type: 'apartment',
        bedrooms: 2,
        bathrooms: 1,
        address: { street: '123 E2E St', area: 'Riverside', city: 'Nairobi', county: 'Nairobi', coordinates: { type: 'Point', coordinates: [36.8172, -1.2864] } },
        rent: { amount: 45000 },
        deposit: 45000,
        subcounty: 'Westlands',
        status: 'available'
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
