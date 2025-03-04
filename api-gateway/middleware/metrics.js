const promClient = require('prom-client');

// Create a Registry to register metrics
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

const serviceRequestCounter = new promClient.Counter({
  name: 'service_requests_total',
  help: 'Total number of requests to microservices',
  labelNames: ['service', 'method', 'status_code']
});

const serviceRequestDurationMicroseconds = new promClient.Histogram({
  name: 'service_request_duration_ms',
  help: 'Duration of requests to microservices in ms',
  labelNames: ['service', 'method'],
  buckets: [1, 5, 15, 50, 100, 200, 500, 1000, 2000]
});

// Register metrics
register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(httpRequestCounter);
register.registerMetric(serviceRequestCounter);
register.registerMetric(serviceRequestDurationMicroseconds);

// Middleware to collect metrics
const metricsMiddleware = (req, res, next) => {
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
};

// Function to record service request metrics
const recordServiceRequest = (service, method, statusCode, duration) => {
  serviceRequestCounter
    .labels(service, method, statusCode)
    .inc();
  
  serviceRequestDurationMicroseconds
    .labels(service, method)
    .observe(duration);
};

module.exports = {
  register,
  metricsMiddleware,
  recordServiceRequest,
  metrics: {
    httpRequestDurationMicroseconds,
    httpRequestCounter,
    serviceRequestCounter,
    serviceRequestDurationMicroseconds
  }
};