const { spawn } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Helper function to create a colored logger
const createLogger = (serviceName, color) => {
  return (data) => {
    const timestamp = new Date().toISOString();
    const message = data.toString().trim();
    if (message) {
      console.log(`\x1b[${color}m[${timestamp}] [${serviceName}] ${message}\x1b[0m`);
    }
  };
};

// Start a service
const startService = (name, command, args, color) => {
  console.log(`\x1b[${color}m[${name}] Starting...\x1b[0m`);
  
  const service = spawn(command, args, {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, FORCE_COLOR: true }
  });
  
  const logger = createLogger(name, color);
  
  service.stdout.on('data', logger);
  service.stderr.on('data', logger);
  
  service.on('close', (code) => {
    console.log(`\x1b[${color}m[${name}] Process exited with code ${code}\x1b[0m`);
  });
  
  return service;
};

// Start all services
const services = [
  {
    name: 'API Gateway',
    command: 'node',
    args: ['api-gateway/server.js'],
    color: '36' // Cyan
  },
  {
    name: 'User Service',
    command: 'node',
    args: ['services/user-service/server.js'],
    color: '32' // Green
  },
  {
    name: 'Product Service',
    command: 'node',
    args: ['services/product-service/server.js'],
    color: '33' // Yellow
  },
  {
    name: 'Order Service',
    command: 'node',
    args: ['services/order-service/server.js'],
    color: '35' // Magenta
  }
];

// Start all services
const runningServices = services.map(service => 
  startService(service.name, service.command, service.args, service.color)
);

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down all services...');
  runningServices.forEach(service => {
    service.kill('SIGTERM');
  });
});

console.log('\x1b[1m\x1b[34mAll microservices are starting. Press Ctrl+C to stop all services.\x1b[0m');