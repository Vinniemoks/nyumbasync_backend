/**
 * Test Flows Engine
 * Run this script to test the Flow Engine with sample events
 */

require('dotenv').config();
const { connectWithRetry } = require('../config/database');
const { initializeFlowEngine, flowEngine } = require('../flows');
const { Contact, Property, Transaction } = require('../models');
const logger = require('../utils/logger');

async function testFlows() {
  try {
    console.log('🧪 Testing Flows Engine...\n');

    // Connect to database
    await connectWithRetry();

    // Initialize Flow Engine
    await initializeFlowEngine();

    console.log('\n📊 Flow Engine Stats:');
    const stats = flowEngine.getStats();
    console.log(JSON.stringify(stats, null, 2));

    console.log('\n📋 Registered Flows:');
    const flows = flowEngine.getFlows();
    flows.forEach(flow => {
      console.log(`  ${flow.enabled ? '✅' : '⏸️ '} ${flow.name} (${flow.id})`);
    });

    // Test 1: Trigger contact.created event
    console.log('\n\n🧪 Test 1: Triggering contact.created event...');
    await flowEngine.triggerEvent('contact.created', {
      contact: {
        _id: '507f1f77bcf86cd799439011',
        firstName: 'Test',
        lastName: 'Buyer',
        email: 'test@example.com',
        phone: '254722334455',
        primaryRole: 'buyer',
        tags: []
      },
      contactId: '507f1f77bcf86cd799439011',
      primaryRole: 'buyer'
    });

    // Wait a bit for async execution
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 2: Trigger contact.tagged event
    console.log('\n🧪 Test 2: Triggering contact.tagged event (first-time-buyer)...');
    await flowEngine.triggerEvent('contact.tagged', {
      contact: {
        _id: '507f1f77bcf86cd799439011',
        firstName: 'Test',
        lastName: 'Buyer',
        email: 'test@example.com',
        phone: '254722334455',
        primaryRole: 'buyer',
        tags: ['first-time-buyer'],
        buyerProfile: {
          criteria: {
            maxPrice: 50000,
            locations: ['Kilimani']
          }
        }
      },
      contactId: '507f1f77bcf86cd799439011',
      tag: 'first-time-buyer',
      allTags: ['first-time-buyer']
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 3: Trigger contact.status.changed event
    console.log('\n🧪 Test 3: Triggering contact.status.changed event (hot lead)...');
    await flowEngine.triggerEvent('contact.status.changed', {
      contact: {
        _id: '507f1f77bcf86cd799439011',
        firstName: 'Test',
        lastName: 'Buyer',
        email: 'test@example.com',
        phone: '254722334455',
        primaryRole: 'buyer',
        assignedTo: '507f1f77bcf86cd799439012'
      },
      contactId: '507f1f77bcf86cd799439011',
      oldStatus: 'warm',
      newStatus: 'hot'
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 4: Trigger transaction.stage.changed event
    console.log('\n🧪 Test 4: Triggering transaction.stage.changed event (under_contract)...');
    await flowEngine.triggerEvent('transaction.stage.changed', {
      transaction: {
        _id: '507f1f77bcf86cd799439013',
        property: {
          _id: '507f1f77bcf86cd799439014',
          title: '2BR Apartment in Kilimani',
          address: {
            street: '123 Main St',
            area: 'Kilimani',
            city: 'Nairobi'
          }
        },
        primaryBuyer: {
          contact: {
            _id: '507f1f77bcf86cd799439011',
            firstName: 'Test',
            lastName: 'Buyer',
            email: 'test@example.com'
          }
        },
        pipeline: {
          stage: 'under_contract',
          probability: 75
        }
      },
      transactionId: '507f1f77bcf86cd799439013',
      oldStage: 'offer_made',
      newStage: 'under_contract'
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test 5: Trigger property.created event
    console.log('\n🧪 Test 5: Triggering property.created event...');
    await flowEngine.triggerEvent('property.created', {
      property: {
        _id: '507f1f77bcf86cd799439015',
        title: '3BR House in Westlands',
        type: 'house',
        bedrooms: 3,
        bathrooms: 2,
        address: {
          area: 'Westlands',
          city: 'Nairobi'
        },
        rent: {
          amount: 65000
        },
        status: 'available'
      },
      propertyId: '507f1f77bcf86cd799439015',
      type: 'house',
      area: 'Westlands',
      rent: 65000
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Show execution history
    console.log('\n\n📜 Execution History:');
    const history = flowEngine.getExecutionHistory(10);
    history.forEach(execution => {
      const statusIcon = execution.status === 'completed' ? '✅' : 
                        execution.status === 'failed' ? '❌' : 
                        execution.status === 'skipped' ? '⏭️' : '⏳';
      console.log(`  ${statusIcon} ${execution.flowName}`);
      console.log(`     Status: ${execution.status}`);
      if (execution.duration) {
        console.log(`     Duration: ${execution.duration}ms`);
      }
      if (execution.reason) {
        console.log(`     Reason: ${execution.reason}`);
      }
      if (execution.results && execution.results.length > 0) {
        console.log(`     Actions: ${execution.results.length}`);
        execution.results.forEach(result => {
          console.log(`       - ${result.type}: ${result.status}`);
        });
      }
      console.log('');
    });

    // Final stats
    console.log('\n📊 Final Stats:');
    const finalStats = flowEngine.getStats();
    console.log(JSON.stringify(finalStats, null, 2));

    console.log('\n✅ Flow Engine testing complete!\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testFlows();
