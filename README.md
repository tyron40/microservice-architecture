# Microservice Architecture Dashboard

A modern, scalable microservice system with API gateway, service discovery, and real-time monitoring dashboard built with Node.js and Express.

## Features

- **Interactive Dashboard**: Real-time monitoring of service health and metrics
- **API Gateway**: Centralized entry point with rate limiting and request routing
- **Service Discovery**: Automatic service registration and health checks using Consul
- **Load Balancing**: Intelligent request distribution across service instances
- **Metrics & Monitoring**: Prometheus metrics collection and visualization
- **Mock Data Support**: Fallback to mock data when services are unavailable
- **Swagger Documentation**: Interactive API documentation
- **Microservices**:
  - User Service: User management and authentication
  - Product Service: Product catalog and inventory
  - Order Service: Order processing and management

## Tech Stack

- **Backend**: Node.js, Express
- **Service Discovery**: Consul
- **Metrics**: Prometheus
- **Documentation**: Swagger/OpenAPI
- **Database**: MongoDB
- **Communication**: gRPC
- **Containerization**: Docker
- **Orchestration**: Kubernetes

## Project Structure

```
.
├── api-gateway/
│   ├── middleware/
│   │   └── metrics.js
│   ├── public/
│   │   ├── index.html
│   │   ├── scripts.js
│   │   └── styles.css
│   ├── routes/
│   │   └── swagger.js
│   └── server.js
├── services/
│   ├── user-service/
│   │   ├── models/
│   │   │   └── user.js
│   │   └── server.js
│   ├── product-service/
│   │   ├── models/
│   │   │   └── product.js
│   │   └── server.js
│   └── order-service/
│       ├── models/
│       │   └── order.js
│       └── server.js
├── protos/
│   ├── user.proto
│   ├── product.proto
│   └── order.proto
├── kubernetes/
│   ├── api-gateway-deployment.yaml
│   ├── user-service-deployment.yaml
│   ├── product-service-deployment.yaml
│   ├── order-service-deployment.yaml
│   ├── consul-deployment.yaml
│   └── mongodb-deployment.yaml
├── scripts/
│   └── start-all.js
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- MongoDB
- Docker and Docker Compose (for containerized deployment)
- Kubernetes (for production deployment)

### Local Development

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd microservice-architecture
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory with the following content:
   ```env
   # API Gateway
   API_GATEWAY_PORT=3000
   
   # Service Discovery
   CONSUL_HOST=localhost
   CONSUL_PORT=8500
   
   # User Service
   USER_SERVICE_PORT=3001
   USER_SERVICE_HOST=localhost
   
   # Product Service
   PRODUCT_SERVICE_PORT=3002
   PRODUCT_SERVICE_HOST=localhost
   
   # Order Service
   ORDER_SERVICE_PORT=3003
   ORDER_SERVICE_HOST=localhost
   
   # MongoDB
   MONGODB_URI=mongodb://localhost:27017/microservices
   ```

4. Start all services:
   ```bash
   npm run start:all
   ```

   Or start individual services:
   ```bash
   npm run start           # API Gateway
   npm run start:user     # User Service
   npm run start:product  # Product Service
   npm run start:order    # Order Service
   ```

5. Access the services:
   - Dashboard: http://localhost:3000
   - API Documentation: http://localhost:3000/api-docs
   - Metrics: http://localhost:3000/metrics

### Docker Deployment

1. Build and run using Docker Compose:
   ```bash
   docker-compose up --build
   ```

### Kubernetes Deployment

1. Apply Kubernetes configurations:
   ```bash
   kubectl apply -f kubernetes/
   ```

## API Endpoints

### User Service
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Product Service
- `GET /api/products` - List all products
- `GET /api/products/:id` - Get product by ID
- `POST /api/products` - Create new product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Order Service
- `GET /api/orders` - List all orders
- `GET /api/orders/:id` - Get order by ID
- `POST /api/orders` - Create new order
- `PUT /api/orders/:id` - Update order status
- `DELETE /api/orders/:id` - Delete order

## Dashboard Features

- **System Status**: Real-time monitoring of API Gateway and service health
- **Service Health**: Individual service status and uptime tracking
- **Request Distribution**: Visual representation of API request distribution
- **Response Times**: Service response time monitoring
- **Interactive API Testing**: Built-in API testing interface for all endpoints

## Architecture

```
┌─────────────┐
│   Clients   │
│  Dashboard  │
└──────┬──────┘
       │
       ▼
┌──────────────┐     ┌─────────────┐
│              │     │             │
│ API Gateway  │◄───►│   Consul    │
│              │     │             │
└──┬─────┬─────┘     └─────────────┘
   │     │     ▲
   │     │     │
   ▼     ▼     │
┌─────┐ ┌─────┐ ┌─────┐
│User │ │Prod.│ │Order│
│Serv.│ │Serv.│ │Serv.│
└──┬──┘ └──┬──┘ └──┬──┘
   │       │       │
   └───────┼───────┘
           ▼
     ┌───────────┐
     │           │
     │ MongoDB   │
     │           │
     └───────────┘
```

## Monitoring & Metrics

The system collects various metrics using Prometheus:

- Request duration
- Request counts by endpoint
- Service response times
- Error rates
- System resource usage

## Error Handling

The system implements comprehensive error handling:

- Service unavailability fallback to mock data
- Rate limiting protection
- Request timeout handling
- Graceful service degradation
- Detailed error logging

## Security

- Rate limiting on all API endpoints
- Request validation
- Error message sanitization
- Secure service communication
- Environment variable configuration

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
