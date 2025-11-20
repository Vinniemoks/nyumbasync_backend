/**
 * Setup Script for Core Data Models
 * Run this to initialize the database with indexes and sample data
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Property, Contact, Transaction, User } = require('../models');
const { connectWithRetry } = require('../config/database');

async function setupCoreModels() {
  try {
    console.log('🚀 Starting Nyumbasync Core Models Setup...\n');

    // Connect to database
    await connectWithRetry();
    console.log('✅ Connected to MongoDB\n');

    // Create indexes
    console.log('📊 Creating indexes...');
    await Property.createIndexes();
    console.log('  ✓ Property indexes created');
    
    await Contact.createIndexes();
    console.log('  ✓ Contact indexes created');
    
    await Transaction.createIndexes();
    console.log('  ✓ Transaction indexes created');
    
    console.log('✅ All indexes created\n');

    // Check if we should add sample data
    const propertyCount = await Property.countDocuments();
    const contactCount = await Contact.countDocuments();
    const transactionCount = await Transaction.countDocuments();

    console.log('📈 Current Database Stats:');
    console.log(`  Properties: ${propertyCount}`);
    console.log(`  Contacts: ${contactCount}`);
    console.log(`  Transactions: ${transactionCount}\n`);

    if (propertyCount === 0 && contactCount === 0 && transactionCount === 0) {
      console.log('💡 Database is empty. Would you like to add sample data?');
      console.log('   Run: node scripts/seed-sample-data.js\n');
    }

    console.log('✅ Core Models Setup Complete!\n');
    console.log('📚 Documentation:');
    console.log('  - CORE_DATA_MODELS.md - Complete model documentation');
    console.log('  - QUICK_START_MODELS.md - Quick reference guide\n');

    console.log('🎯 Next Steps:');
    console.log('  1. Review the model documentation');
    console.log('  2. Test the models with sample data');
    console.log('  3. Build API endpoints for CRUD operations');
    console.log('  4. Implement the Flows Engine for automation\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run setup
setupCoreModels();
