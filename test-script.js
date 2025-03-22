// Simple test script for the Skytells SDK
// Run with: node test-script.js YOUR_API_KEY

// Import the SDK (assumes you've built it with 'npm run build')
import { createClient } from './dist/index.js';
import { fileURLToPath } from 'url';
import process from 'process';

const apiKey = process.argv[2];
if (!apiKey) {
  console.error('Please provide your API key as a command line argument');
  console.error('Example: node test-script.js YOUR_API_KEY');
  process.exit(1);
}

// Create a client instance
const client = createClient(apiKey);

async function runTests() {
  try {
    // Test 1: List models
    console.log('Testing listModels()...');
    const models = await client.listModels();
    console.log(`✅ Success! Found ${models.length} models.`);
    console.log('First model:', models[0]?.name || 'No models found');
    console.log('-'.repeat(40));

    // Test 2: Make a simple prediction
    console.log('Testing predict()...');
    const prediction = await client.predict({
      model: models[0]?.name || 'default-model', // Use first available model
      input: {
        prompt: 'Hello, world!'
      }
    });
    console.log(`✅ Success! Prediction ID: ${prediction.id}`);
    console.log('Prediction status:', prediction.status);
    console.log('-'.repeat(40));

    // Test 3: Get prediction by ID
    console.log(`Testing getPrediction() with ID: ${prediction.id}...`);
    const retrievedPrediction = await client.getPrediction(prediction.id);
    console.log(`✅ Success! Retrieved prediction status: ${retrievedPrediction.status}`);
    console.log('-'.repeat(40));

    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('❌ Test failed with error:');
    console.error(`Error ID: ${error.errorId || 'N/A'}`);
    console.error(`Message: ${error.message || error}`);
    console.error(`HTTP Status: ${error.httpStatus || 'N/A'}`);
    console.error(`Details: ${error.details || 'N/A'}`);
  }
}

// Run the tests
runTests(); 