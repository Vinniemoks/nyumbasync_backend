/**
 * Seed Sample Data for Testing
 * Creates sample properties, contacts, and transactions
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Property, Contact, Transaction, User } = require('../models');
const { connectWithRetry } = require('../config/database');

async function seedSampleData() {
  try {
    console.log('🌱 Seeding sample data...\n');

    await connectWithRetry();

    // Find or create a sample landlord user
    let landlord = await User.findOne({ role: 'landlord' });
    if (!landlord) {
      landlord = await User.create({
        firstName: 'John',
        lastName: 'Landlord',
        email: 'landlord@example.com',
        phone: '254712000001',
        role: 'landlord',
        password: 'Password123!',
        isVerified: true
      });
      console.log('✓ Created sample landlord user');
    }

    // Create sample properties
    console.log('\n📍 Creating sample properties...');
    
    const property1 = await Property.create({
      title: '2BR Apartment in Kilimani',
      description: 'Modern 2-bedroom apartment in the heart of Kilimani. Features include spacious living room, modern kitchen, and secure parking. Close to shopping centers and public transport.',
      type: 'apartment',
      bedrooms: 2,
      bathrooms: 1,
      squareFootage: 900,
      address: {
        street: '123 Ngong Road',
        area: 'Kilimani',
        city: 'Nairobi',
        county: 'Nairobi'
      },
      rent: { amount: 35000 },
      deposit: 70000,
      landlord: landlord._id,
      amenities: ['parking', 'security', 'wifi', 'backup_generator'],
      status: 'available',
      listing: {
        isListed: true,
        listPrice: 35000,
        listDate: new Date(),
        daysOnMarket: 5
      }
    });
    console.log(`  ✓ ${property1.title}`);

    const property2 = await Property.create({
      title: '3BR House in Westlands',
      description: 'Spacious 3-bedroom house with a beautiful garden in Westlands. Perfect for families. Features include modern kitchen, large living area, and ample parking space.',
      type: 'house',
      bedrooms: 3,
      bathrooms: 2,
      squareFootage: 1500,
      address: {
        street: '456 Parklands Avenue',
        area: 'Westlands',
        city: 'Nairobi',
        county: 'Nairobi'
      },
      rent: { amount: 65000 },
      deposit: 130000,
      landlord: landlord._id,
      amenities: ['parking', 'security', 'garden', 'backup_generator', 'water_tank'],
      status: 'available',
      listing: {
        isListed: true,
        listPrice: 65000,
        listDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        daysOnMarket: 10
      },
      investment: {
        purchasePrice: 8000000,
        purchaseDate: new Date('2023-01-15'),
        projectedRentalIncome: 65000
      }
    });
    console.log(`  ✓ ${property2.title}`);

    // Create sample contacts
    console.log('\n👥 Creating sample contacts...');

    const buyer1 = await Contact.create({
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.j@example.com',
      phone: '254722111222',
      primaryRole: 'buyer',
      roles: ['buyer', 'lead'],
      buyerProfile: {
        status: 'hot',
        preApproved: true,
        preApprovalAmount: 50000,
        criteria: {
          propertyTypes: ['apartment'],
          minBedrooms: 2,
          maxBedrooms: 3,
          maxPrice: 45000,
          locations: ['Kilimani', 'Westlands'],
          mustHaveAmenities: ['parking', 'security']
        }
      },
      tags: ['first-time-renter', 'urgent'],
      source: 'website'
    });
    console.log(`  ✓ ${buyer1.fullName} (Hot Buyer)`);

    const buyer2 = await Contact.create({
      firstName: 'Michael',
      lastName: 'Chen',
      email: 'michael.chen@example.com',
      phone: '254733222333',
      primaryRole: 'buyer',
      roles: ['buyer'],
      buyerProfile: {
        status: 'warm',
        criteria: {
          propertyTypes: ['house'],
          minBedrooms: 3,
          maxPrice: 80000,
          locations: ['Westlands', 'Lavington']
        }
      },
      tags: ['family', 'relocating'],
      source: 'referral'
    });
    console.log(`  ✓ ${buyer2.fullName} (Warm Buyer)`);

    const inspector = await Contact.create({
      firstName: 'David',
      lastName: 'Kimani',
      email: 'david.k@inspections.co.ke',
      phone: '254744333444',
      primaryRole: 'inspector',
      roles: ['inspector'],
      serviceProvider: {
        company: 'Nairobi Property Inspections',
        specialty: 'Residential Inspections',
        licenseNumber: 'INS-2024-001',
        rating: 4.8,
        hourlyRate: 5000
      }
    });
    console.log(`  ✓ ${inspector.fullName} (Inspector)`);

    // Link contacts to properties
    console.log('\n🔗 Creating relationships...');
    
    await buyer1.linkProperty(property1._id, 'interested', 'Very interested, wants to schedule viewing');
    await property1.linkContact(buyer1._id, 'interested');
    console.log('  ✓ Linked Sarah to Kilimani apartment');

    await buyer2.linkProperty(property2._id, 'viewed', 'Viewed property, liked the garden');
    await property2.linkContact(buyer2._id, 'viewed');
    console.log('  ✓ Linked Michael to Westlands house');

    // Add interactions
    await buyer1.addInteraction({
      type: 'call',
      subject: 'Initial inquiry',
      notes: 'Called about 2BR apartments in Kilimani. Budget up to 45k. Needs parking.',
      nextAction: 'Send property listings',
      nextActionDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    console.log('  ✓ Added interaction for Sarah');

    await buyer2.addInteraction({
      type: 'showing',
      subject: 'Property viewing',
      notes: 'Showed Westlands house. Family loved it but concerned about price.',
      nextAction: 'Follow up on financing options',
      nextActionDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
    });
    console.log('  ✓ Added interaction for Michael');

    // Create sample transactions
    console.log('\n💼 Creating sample transactions...');

    const deal1 = await Transaction.create({
      dealType: 'lease',
      property: property1._id,
      amount: 35000,
      type: 'rent',
      description: 'Lease agreement for 2BR Kilimani apartment',
      pipeline: {
        stage: 'showing_scheduled',
        probability: 40,
        expectedCloseDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
      }
    });
    
    await deal1.addContact(buyer1._id, 'buyer', true);
    await deal1.addContact(landlord._id, 'landlord', true);
    
    await deal1.addMilestone('Property viewing', new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
    await deal1.addMilestone('Lease signing', new Date(Date.now() + 10 * 24 * 60 * 60 * 1000));
    
    await deal1.addTask({
      title: 'Schedule property viewing',
      description: 'Coordinate viewing with Sarah for this weekend',
      dueDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
      priority: 'high',
      status: 'todo'
    });
    
    console.log(`  ✓ Deal: ${property1.title} - ${deal1.pipeline.stage}`);

    const deal2 = await Transaction.create({
      dealType: 'lease',
      property: property2._id,
      amount: 65000,
      type: 'rent',
      description: 'Lease agreement for 3BR Westlands house',
      pipeline: {
        stage: 'offer_made',
        probability: 60,
        expectedCloseDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
      }
    });
    
    await deal2.addContact(buyer2._id, 'buyer', true);
    await deal2.addContact(landlord._id, 'landlord', true);
    await deal2.addContact(inspector._id, 'inspector', false);
    
    await deal2.addMilestone('Property inspection', new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));
    await deal2.addMilestone('Lease signing', new Date(Date.now() + 15 * 24 * 60 * 60 * 1000));
    
    await deal2.addTask({
      title: 'Schedule property inspection',
      description: 'Book David Kimani for inspection',
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      priority: 'high',
      status: 'todo'
    });
    
    await deal2.addNote('Buyer offered asking price. Waiting on inspection results.', landlord._id);
    
    console.log(`  ✓ Deal: ${property2.title} - ${deal2.pipeline.stage}`);

    // Update contact relationships
    await buyer1.relatedTransactions.push(deal1._id);
    await buyer1.save();
    
    await buyer2.relatedTransactions.push(deal2._id);
    await buyer2.save();

    // Update property relationships
    await property1.transactionHistory.push(deal1._id);
    await property1.save();
    
    await property2.transactionHistory.push(deal2._id);
    await property2.save();

    console.log('\n✅ Sample data seeded successfully!\n');
    
    console.log('📊 Summary:');
    console.log(`  Properties: 2`);
    console.log(`  Contacts: 3`);
    console.log(`  Transactions: 2`);
    console.log(`  Interactions: 2`);
    console.log(`  Milestones: 4`);
    console.log(`  Tasks: 2\n`);

    console.log('🎯 Try these queries:');
    console.log('  - Contact.findHotLeads()');
    console.log('  - Property.findAvailable({ area: "Kilimani" })');
    console.log('  - Transaction.getActivePipeline()');
    console.log('  - Transaction.findByStage("showing_scheduled")\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

seedSampleData();
