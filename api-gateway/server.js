const express = require('express');
const bodyParser = require('body-parser');
const proxy = require('express-http-proxy');
const winston = require('winston');
const expressWinston = require('express-winston');
const Consul = require('consul');
const dotenv = require('dotenv');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const rateLimit = require('express-rate-limit');
const promClient = require('prom-client');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.API_GATEWAY_PORT || 3000;

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Configure Consul client for service discovery with fallback mechanism
let consul = null;
let consulAvailable = false;

try {
  consul = new Consul({
    host: process.env.CONSUL_HOST || 'localhost',
    port: process.env.CONSUL_PORT || 8500,
    promisify: true
  });
  
  // Test Consul connection
  consul.status.leader()
    .then(() => {
      consulAvailable = true;
      logger.info('Connected to Consul successfully');
    })
    .catch(err => {
      logger.warn(`Consul not available: ${err.message}. Using direct service routing.`);
    });
} catch (error) {
  logger.warn(`Failed to initialize Consul: ${error.message}. Using direct service routing.`);
}

// Setup Prometheus metrics
const register = new promClient.Registry();

// Custom metrics
const httpRequestDurationMicroseconds = new promClient.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in ms',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [1, 5, 15, 50, 100, 200, 500, 1000, 2000]
});

const httpRequestCounter = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// Register metrics
register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(httpRequestCounter);

// Disable default metrics which are causing issues
// promClient.collectDefaultMetrics({ register });

// Rate limiting middleware with custom IP resolver
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  // Custom IP resolver to handle undefined IP addresses
  keyGenerator: (req) => {
    // Use a default IP if req.ip is undefined
    return req.ip || req.connection.remoteAddress || '127.0.0.1';
  },
  // Skip rate limiting in development environment
  skip: (req) => {
    return process.env.NODE_ENV === 'development';
  }
});

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Microservice Architecture API',
      version: '1.0.0',
      description: 'API documentation for the microservice architecture',
      contact: {
        name: 'API Support',
        email: 'support@example.com'
      }
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server'
      }
    ],
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            price: { type: 'number' },
            stock: { type: 'integer' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            user_id: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  product_id: { type: 'string' },
                  quantity: { type: 'integer' },
                  price: { type: 'number' }
                }
              }
            },
            total_amount: { type: 'number' },
            status: { type: 'string', enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'] },
            shipping_address: { type: 'string' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' }
          }
        }
      }
    }
  },
  apis: ['./api-gateway/routes/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Logging middleware
app.use(expressWinston.logger({
  transports: [
    new winston.transports.Console()
  ],
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.simple()
  ),
  meta: false,
  msg: "HTTP {{req.method}} {{req.url}}",
  expressFormat: true,
  colorize: true
}));

// Metrics middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  // Record end time and calculate duration on response finish
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route ? req.route.path : req.path;
    
    httpRequestDurationMicroseconds
      .labels(req.method, route, res.statusCode)
      .observe(duration);
    
    httpRequestCounter
      .labels(req.method, route, res.statusCode)
      .inc();
  });
  
  next();
});

// Service discovery function with fallback to direct connection
const getServiceAddress = async (serviceName) => {
  // If Consul is not available, use direct connection based on environment variables
  if (!consulAvailable) {
    switch (serviceName) {
      case 'user-service':
        return `http://${process.env.USER_SERVICE_HOST || 'localhost'}:${process.env.USER_SERVICE_PORT || 3001}`;
      case 'product-service':
        return `http://${process.env.PRODUCT_SERVICE_HOST || 'localhost'}:${process.env.PRODUCT_SERVICE_PORT || 3002}`;
      case 'order-service':
        return `http://${process.env.ORDER_SERVICE_HOST || 'localhost'}:${process.env.ORDER_SERVICE_PORT || 3003}`;
      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }
  }
  
  // If Consul is available, use service discovery
  try {
    const result = await consul.catalog.service.nodes(serviceName);
    
    if (!result || result.length === 0) {
      throw new Error(`Service ${serviceName} not found in Consul`);
    }
    
    // Simple load balancing - random selection
    const service = result[Math.floor(Math.random() * result.length)];
    return `http://${service.ServiceAddress}:${service.ServicePort}`;
  } catch (error) {
    logger.error(`Error discovering service ${serviceName}: ${error.message}`);
    
    // Fallback to direct connection if Consul query fails
    switch (serviceName) {
      case 'user-service':
        return `http://${process.env.USER_SERVICE_HOST || 'localhost'}:${process.env.USER_SERVICE_PORT || 3001}`;
      case 'product-service':
        return `http://${process.env.PRODUCT_SERVICE_HOST || 'localhost'}:${process.env.PRODUCT_SERVICE_PORT || 3002}`;
      case 'order-service':
        return `http://${process.env.ORDER_SERVICE_HOST || 'localhost'}:${process.env.ORDER_SERVICE_PORT || 3003}`;
      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }
  }
};

// Mock service data for development
const mockServices = {
  'user-service': {
    users: [
      { id: '1', name: 'John Doe', email: 'john@example.com', created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: '2', name: 'Jane Smith', email: 'jane@example.com', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ]
  },
  'product-service': {
    products: [
      { id: '1', name: 'Laptop', description: 'High-performance laptop', price: 1299.99, stock: 50, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: '2', name: 'Smartphone', description: 'Latest smartphone model', price: 899.99, stock: 100, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ]
  },
  'order-service': {
    orders: [
      { 
        id: '1', 
        user_id: '1', 
        items: [{ product_id: '1', quantity: 1, price: 1299.99 }], 
        total_amount: 1299.99, 
        status: 'delivered', 
        shipping_address: '123 Main St, City, Country',
        created_at: new Date().toISOString(), 
        updated_at: new Date().toISOString() 
      }
    ]
  }
};

// Dynamic proxy middleware with mock data fallback
const createProxyMiddleware = (serviceName) => {
  return async (req, res, next) => {
    try {
      // Check if services are running, if not use mock data
      const serviceUrl = await getServiceAddress(serviceName);
      
      try {
        // Try to connect to the service
        const fetchModule = await import('node-fetch');
        const fetch = fetchModule.default;
        
        // Test connection with a timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        
        await fetch(`${serviceUrl}/health`, { 
          signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        
        // If connection successful, proxy the request
        logger.info(`Routing ${req.method} ${req.url} to ${serviceUrl}`);
        return proxy(serviceUrl)(req, res, next);
      } catch (error) {
        // If connection fails, use mock data
        logger.warn(`Service ${serviceName} not available, using mock data: ${error.message}`);
        
        // Handle different endpoints with mock data
        const path = req.path;
        const method = req.method;
        const id = path.split('/').pop();
        
        if (serviceName === 'user-service') {
          if (path === '/api/users' && method === 'GET') {
            return res.json({ users: mockServices['user-service'].users, total: mockServices['user-service'].users.length });
          } else if (path.match(/\/api\/users\/\w+/) && method === 'GET') {
            const user = mockServices['user-service'].users.find(u => u.id === id);
            if (user) {
              return res.json(user);
            }
            return res.status(404).json({ error: 'User not found' });
          }
        } else if (serviceName === 'product-service') {
          if (path === '/api/products' && method === 'GET') {
            return res.json({ products: mockServices['product-service'].products, total: mockServices['product-service'].products.length });
          } else if (path.match(/\/api\/products\/\w+/) && method === 'GET') {
            const product = mockServices['product-service'].products.find(p => p.id === id);
            if (product) {
              return res.json(product);
            }
            return res.status(404).json({ error: 'Product not found' });
          }
        } else if (serviceName === 'order-service') {
          if (path === '/api/orders' && method === 'GET') {
            return res.json({ orders: mockServices['order-service'].orders, total: mockServices['order-service'].orders.length });
          } else if (path.match(/\/api\/orders\/\w+/) && method === 'GET') {
            const order = mockServices['order-service'].orders.find(o => o.id === id);
            if (order) {
              return res.json(order);
            }
            return res.status(404).json({ error: 'Order not found' });
          }
        }
        
        // For other endpoints or methods, return a service unavailable message
        return res.status(503).json({ 
          error: `Service ${serviceName} unavailable`,
          message: 'This is a mock response. In a production environment, this would connect to the actual microservice.',
          note: 'To see the full functionality, please start the corresponding microservice.'
        });
      }
    } catch (error) {
      logger.error(`Error routing to ${serviceName}: ${error.message}`);
      res.status(503).json({ error: `Service ${serviceName} unavailable` });
    }
  };
};

// Root endpoint - API documentation
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Routes with rate limiting
app.use('/api/users', apiLimiter, createProxyMiddleware('user-service'));
app.use('/api/products', apiLimiter, createProxyMiddleware('product-service'));
app.use('/api/orders', apiLimiter, createProxyMiddleware('order-service'));

// Swagger API documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    consul: consulAvailable ? 'connected' : 'fallback mode',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// Service status endpoint
app.get('/status', async (req, res) => {
  const services = [
    { name: 'user-service', url: await getServiceAddress('user-service') + '/health' },
    { name: 'product-service', url: await getServiceAddress('product-service') + '/health' },
    { name: 'order-service', url: await getServiceAddress('order-service') + '/health' }
  ];
  
  const serviceStatuses = await Promise.all(
    services.map(async (service) => {
      try {
        // Use node-fetch in a way that works in both ESM and CommonJS
        const fetchModule = await import('node-fetch');
        const fetch = fetchModule.default;
        
        // Add timeout to fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1000);
        
        const response = await fetch(service.url, { 
          signal: controller.signal 
        });
        
        clearTimeout(timeoutId);
        
        let data;
        try {
          data = await response.json();
        } catch (e) {
          data = { error: 'Invalid JSON response' };
        }
        
        return {
          name: service.name,
          status: response.ok ? 'online' : 'error',
          details: response.ok ? data : { error: 'Service not responding properly' }
        };
      } catch (error) {
        // Return mock status for development
        return {
          name: service.name,
          status: 'offline',
          details: { 
            error: error.message,
            note: 'This is a mock response. In a production environment, this would connect to the actual microservice.',
            uptime: 0
          }
        };
      }
    })
  );
  
  res.json({
    gateway: {
      status: 'online',
      uptime: process.uptime(),
      consul: consulAvailable ? 'connected' : 'fallback mode'
    },
    services: serviceStatuses
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start the server
app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  
  // Register with Consul if available
  if (consulAvailable && consul) {
    consul.agent.service.register({
      name: 'api-gateway',
      address: process.env.API_GATEWAY_HOST || 'localhost',
      port: parseInt(PORT, 10),
      check: {
        http: `http://localhost:${PORT}/health`,
        interval: '10s'
      }
    })
    .then(() => {
      logger.info('Registered with Consul');
    })
    .catch(err => {
      logger.error(`Failed to register with Consul: ${err.message}`);
    });
  } else {
    logger.info('Running without Consul service registration');
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  
  if (consulAvailable && consul) {
    consul.agent.service.deregister('api-gateway')
      .then(() => {
        logger.info('Deregistered from Consul');
        process.exit(0);
      })
      .catch(err => {
        logger.error(`Error deregistering from Consul: ${err.message}`);
        process.exit(1);
      });
  } else {
    process.exit(0);
  }
});