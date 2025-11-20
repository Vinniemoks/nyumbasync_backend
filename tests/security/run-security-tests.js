/**
 * Security Test Runner
 * Runs all security tests and generates a report
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🔒 Running Security Tests...\n');

const tests = [
  {
    name: 'MFA Tests',
    file: 'tests/security/mfa.test.js',
    description: 'Multi-factor authentication functionality'
  },
  {
    name: 'Account Lockout Tests',
    file: 'tests/security/account-lockout.test.js',
    description: 'Brute force protection and account locking'
  },
  {
    name: 'Password History Tests',
    file: 'tests/security/password-history.test.js',
    description: 'Password reuse prevention'
  },
  {
    name: 'Token Blacklist Tests',
    file: 'tests/security/security.test.js',
    description: 'Token invalidation on logout'
  }
];

async function runTest(test) {
  return new Promise((resolve) => {
    console.log(`\n📋 Running: ${test.name}`);
    console.log(`   ${test.description}`);
    console.log(`   File: ${test.file}\n`);

    const mocha = spawn('npx', ['mocha', test.file, '--timeout', '10000'], {
      stdio: 'inherit',
      shell: true
    });

    mocha.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${test.name} - PASSED\n`);
        resolve({ name: test.name, passed: true });
      } else {
        console.log(`❌ ${test.name} - FAILED\n`);
        resolve({ name: test.name, passed: false });
      }
    });
  });
}

async function runAllTests() {
  const results = [];

  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('🔒 SECURITY TEST SUMMARY');
  console.log('='.repeat(60) + '\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    const status = result.passed ? 'PASSED' : 'FAILED';
    console.log(`${icon} ${result.name}: ${status}`);
  });

  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Success Rate: ${Math.round((passed / total) * 100)}%`);
  console.log('-'.repeat(60) + '\n');

  if (failed === 0) {
    console.log('🎉 All security tests passed!\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some security tests failed. Please review the output above.\n');
    process.exit(1);
  }
}

runAllTests().catch(error => {
  console.error('Error running tests:', error);
  process.exit(1);
});
