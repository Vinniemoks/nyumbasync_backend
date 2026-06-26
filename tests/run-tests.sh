#!/bin/bash

# NyumbaSync Backend Test Runner
echo "🧪 Running NyumbaSync Backend Tests..."
echo "======================================"

# Set test environment
export NODE_ENV=test

# Run all tests
echo ""
echo "📋 Running all tests..."
npm test

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All tests passed!"
    echo ""
    echo "📊 Generating coverage report..."
    npm test -- --coverage
else
    echo ""
    echo "❌ Some tests failed!"
    exit 1
fi

echo ""
echo "======================================"
echo "✅ Test run complete!"
