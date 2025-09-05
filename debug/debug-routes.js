/**
 * Debug script to identify route issues
 */

const express = require('express');
const app = express();

// Test each route individually to isolate the problem
console.log('Testing route definitions...');

try {
  // Test 1: Basic route
  app.get('/test1', (req, res) => res.send('test1'));
  console.log('✅ Basic route works');
  
  // Test 2: Route with parameter
  app.get('/test2/:id', (req, res) => res.send('test2'));
  console.log('✅ Parameter route works');
  
  // Test 3: Your specific route pattern
  app.get('/api/v1/meters/:meterId/latest', (req, res) => res.send('test3'));
  console.log('✅ Meter route works');
  
  // Test 4: All your routes
  const routes = [
    'POST /api/v1/meter-readings',
    'GET /api/v1/meters', 
    'GET /api/v1/meters/:meterId/latest',
    'GET /api/v1/dashboard/data',
    'GET /api/health',
    'GET /'
  ];
  
  routes.forEach(route => {
    const [method, path] = route.split(' ');
    if (method === 'POST') {
      app.post(path, (req, res) => res.send('ok'));
    } else {
      app.get(path, (req, res) => res.send('ok'));
    }
    console.log(`✅ ${route} defined successfully`);
  });
  
} catch (error) {
  console.error('❌ Route definition error:', error.message);
  console.error('Stack:', error.stack);
}

console.log('Route testing complete');
