/**
 * DLMS Energy Meter API Testing Suite
 * Run with: node test_api.js
 * Prerequisites: npm install axios colors
 */

const axios = require('axios');
const colors = require('colors');

// Configuration
const BASE_URL = 'http://localhost:3000';
const API_KEY = 'poc_demo_key_2024'; // Valid API key from your server
const INVALID_API_KEY = 'invalid_key_123';

// Test counter
let testCount = 0;
let passedTests = 0;
let failedTests = 0;

// Helper functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  switch(type) {
    case 'success':
      console.log(`[${timestamp}] ✅ ${message}`.green);
      break;
    case 'error':
      console.log(`[${timestamp}] ❌ ${message}`.red);
      break;
    case 'info':
      console.log(`[${timestamp}] ℹ️  ${message}`.blue);
      break;
    case 'warning':
      console.log(`[${timestamp}] ⚠️  ${message}`.yellow);
      break;
  }
}

function testResult(testName, passed, details = '') {
  testCount++;
  if (passed) {
    passedTests++;
    log(`TEST PASSED: ${testName} ${details}`, 'success');
  } else {
    failedTests++;
    log(`TEST FAILED: ${testName} ${details}`, 'error');
  }
}

// Sample test data
const sampleMeterData = {
  meter_id: "METER_001_TEST",
  location: "Test Building - Floor 1",
  timestamp: new Date().toISOString(),
  sequence: 12345,
  device_info: {
    manufacturer: "Test Manufacturer",
    model: "TM-100",
    firmware: "v2.1.0"
  },
  readings: [
    {
      obis_code: "1.0.1.7.0.255",
      description: "Active power+",
      value: 1250.5,
      unit: "W",
      scaler: 0
    },
    {
      obis_code: "1.0.2.7.0.255", 
      description: "Active power-",
      value: 0,
      unit: "W",
      scaler: 0
    },
    {
      obis_code: "1.0.1.8.0.255",
      description: "Active energy+ total",
      value: 12345.67,
      unit: "Wh",
      scaler: 3
    },
    {
      obis_code: "1.0.32.7.0.255",
      description: "Voltage L1",
      value: 230.2,
      unit: "V",
      scaler: 0
    }
  ]
};

const largeMeterData = {
  ...sampleMeterData,
  meter_id: "METER_002_LARGE",
  readings: Array(150).fill().map((_, i) => ({
    obis_code: `1.0.${i}.7.0.255`,
    description: `Test reading ${i}`,
    value: Math.random() * 1000,
    unit: "W",
    scaler: 0
  }))
};

// Test functions
async function testHealthEndpoint() {
  log('Testing Health Endpoint...', 'info');
  
  try {
    const response = await axios.get(`${BASE_URL}/api/health`);
    testResult('Health endpoint response', response.status === 200);
    testResult('Health endpoint data structure', 
      response.data.status === 'healthy' && response.data.timestamp);
  } catch (error) {
    testResult('Health endpoint', false, `Error: ${error.message}`);
  }
}

async function testPostMeterReadings() {
  log('Testing POST Meter Readings...', 'info');
  
  // Test with valid API key
  try {
    const response = await axios.post(
      `${BASE_URL}/api/v1/meter-readings`,
      sampleMeterData,
      {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      }
    );
    testResult('POST readings with valid API key', response.status === 200);
    testResult('POST readings response structure', 
      response.data.status === 'success' && response.data.readings_received === 4);
  } catch (error) {
    testResult('POST readings with valid API key', false, `Error: ${error.message}`);
  }

  // Test with invalid API key
  try {
    await axios.post(
      `${BASE_URL}/api/v1/meter-readings`,
      sampleMeterData,
      {
        headers: { 'Authorization': `Bearer ${INVALID_API_KEY}` }
      }
    );
    testResult('POST readings with invalid API key', false, 'Should have returned 401');
  } catch (error) {
    testResult('POST readings with invalid API key', 
      error.response && error.response.status === 401);
  }

  // Test without API key
  try {
    await axios.post(`${BASE_URL}/api/v1/meter-readings`, sampleMeterData);
    testResult('POST readings without API key', false, 'Should have returned 401');
  } catch (error) {
    testResult('POST readings without API key', 
      error.response && error.response.status === 401);
  }

  // Test with invalid payload
  try {
    await axios.post(
      `${BASE_URL}/api/v1/meter-readings`,
      { invalid: 'data' },
      {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      }
    );
    testResult('POST readings with invalid payload', false, 'Should have returned 400');
  } catch (error) {
    testResult('POST readings with invalid payload', 
      error.response && error.response.status === 400);
  }

  // Test with too many readings
  try {
    await axios.post(
      `${BASE_URL}/api/v1/meter-readings`,
      largeMeterData,
      {
        headers: { 'Authorization': `Bearer ${API_KEY}` }
      }
    );
    testResult('POST readings with too many readings', false, 'Should have returned 400');
  } catch (error) {
    testResult('POST readings with too many readings', 
      error.response && error.response.status === 400);
  }
}

async function testGetMeters() {
  log('Testing GET Meters...', 'info');
  
  try {
    const response = await axios.get(`${BASE_URL}/api/v1/meters`);
    testResult('GET meters endpoint', response.status === 200);
    testResult('GET meters response structure', 
      response.data.status === 'success' && Array.isArray(response.data.data));
    
    if (response.data.data.length > 0) {
      const meter = response.data.data[0];
      testResult('GET meters data structure',
        meter.meter_id && 
        typeof meter.total_readings === 'number' &&
        meter.status && 
        (meter.status === 'online' || meter.status === 'offline'));
    }
  } catch (error) {
    testResult('GET meters', false, `Error: ${error.message}`);
  }
}

async function testGetLatestReadings() {
  log('Testing GET Latest Readings...', 'info');
  
  const meterId = sampleMeterData.meter_id;
  
  try {
    const response = await axios.get(`${BASE_URL}/api/v1/meters/${meterId}/latest`);
    testResult('GET latest readings endpoint', response.status === 200);
    testResult('GET latest readings response structure', 
      response.data.status === 'success' && Array.isArray(response.data.data));
  } catch (error) {
    testResult('GET latest readings', false, `Error: ${error.message}`);
  }

  // Test with limit parameter
  try {
    const response = await axios.get(`${BASE_URL}/api/v1/meters/${meterId}/latest?limit=5`);
    testResult('GET latest readings with limit', response.status === 200);
    testResult('GET latest readings limit respected', 
      response.data.data.length <= 5);
  } catch (error) {
    testResult('GET latest readings with limit', false, `Error: ${error.message}`);
  }

  // Test with non-existent meter
  try {
    const response = await axios.get(`${BASE_URL}/api/v1/meters/NON_EXISTENT/latest`);
    testResult('GET latest readings for non-existent meter', response.status === 200);
    testResult('GET latest readings empty result', 
      response.data.data.length === 0);
  } catch (error) {
    testResult('GET latest readings non-existent meter', false, `Error: ${error.message}`);
  }
}

async function testDashboardData() {
  log('Testing Dashboard Data...', 'info');
  
  try {
    const response = await axios.get(`${BASE_URL}/api/v1/dashboard/data`);
    testResult('GET dashboard data endpoint', response.status === 200);
    testResult('GET dashboard data structure', 
      response.data.status === 'success' && 
      response.data.data &&
      typeof response.data.data === 'object');
  } catch (error) {
    testResult('GET dashboard data', false, `Error: ${error.message}`);
  }
}

async function testNotFoundEndpoint() {
  log('Testing 404 Endpoint...', 'info');
  
  try {
    await axios.get(`${BASE_URL}/api/non-existent-endpoint`);
    testResult('404 endpoint', false, 'Should have returned 404');
  } catch (error) {
    testResult('404 endpoint', 
      error.response && error.response.status === 404);
  }
}

async function testDashboardPage() {
  log('Testing Dashboard Page...', 'info');
  
  try {
    const response = await axios.get(`${BASE_URL}/`);
    testResult('Dashboard page endpoint', response.status === 200);
    testResult('Dashboard page content type', 
      response.headers['content-type'].includes('text/html'));
  } catch (error) {
    testResult('Dashboard page', false, `Error: ${error.message}`);
  }
}

// Performance test
async function performanceTest() {
  log('Running Performance Tests...', 'info');
  
  const startTime = Date.now();
  const promises = [];
  
  // Send 10 concurrent requests
  for (let i = 0; i < 10; i++) {
    promises.push(
      axios.get(`${BASE_URL}/api/health`).catch(err => ({ error: err.message }))
    );
  }
  
  const results = await Promise.all(promises);
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  const successCount = results.filter(r => !r.error).length;
  testResult('Concurrent requests handling', successCount >= 8, 
    `${successCount}/10 requests succeeded in ${duration}ms`);
}

// Main test runner
async function runAllTests() {
  console.log('🧪 Starting DLMS Energy Meter API Tests...\n'.cyan.bold);
  
  // Check if server is running
  try {
    await axios.get(`${BASE_URL}/api/health`);
    log('Server is running, starting tests...', 'success');
  } catch (error) {
    log('❌ Server is not running! Please start the server first.', 'error');
    process.exit(1);
  }

  // Run all tests
  await testHealthEndpoint();
  await testPostMeterReadings();
  await testGetMeters();
  await testGetLatestReadings();
  await testDashboardData();
  await testNotFoundEndpoint();
  await testDashboardPage();
  await performanceTest();

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`📊 Test Summary:`.cyan.bold);
  console.log(`Total Tests: ${testCount}`);
  console.log(`Passed: ${passedTests}`.green);
  console.log(`Failed: ${failedTests}`.red);
  console.log(`Success Rate: ${((passedTests/testCount)*100).toFixed(1)}%`);
  
  if (failedTests === 0) {
    console.log('\n🎉 All tests passed!'.green.bold);
  } else {
    console.log('\n⚠️  Some tests failed. Check the logs above.'.yellow.bold);
  }
  
  process.exit(failedTests === 0 ? 0 : 1);
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run tests
runAllTests();