# Microservice Architecture

A scalable microservice system with API gateway, service discovery, and load balancing using Node.js, Docker, Kubernetes, and gRPC.

## Architecture Overview

This project implements a microservice architecture with the following components:

- **API Gateway**: Entry point for all client requests, handles routing to appropriate services
- **Service Discovery**: Using Consul for service registration and discovery
- **Microservices**:
  - User Service: Manages user data
  - Product Service: Manages product data
  - Order Service: Manages order processing
- **Communication**: Using gRPC for inter-service communication
- **Database**: MongoDB for data persistence
- **Containerization**: Docker for containerization
- **Orchestration**: Kubernetes for container orchestration and scaling

## Project Structure

```
.
├── api-gateway/
│   └── server.js
├── protos/
│   ├── user.proto
│   ├── product.proto
│   └── order.proto
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
├── kubernetes/
│   ├── api-gateway-deployment.yaml
│   ├── user-service-deployment.yaml
│   ├── product-service-deployment.yaml
│   ├── order-service-deployment.yaml
│   ├── consul-deployment.yaml
│   └── mongodb-deployment.yaml
├── Dockerfile
├── docker-compose.yml
├── package.json
└── .env
```

## Getting Started

### Prerequisites

- Node.js (v14+)
- Docker and Docker Compose
- Kubernetes cluster (for production deployment)
- MongoDB

### Local Development

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the services using Docker Compose:
   ```
   docker-compose up
   ```

### Kubernetes Deployment

1. Build the Docker image:
   ```
   docker build -t microservice-architecture:latest .
   ```

2. Apply Kubernetes configurations:
   ```
   kubectl apply -f kubernetes/
   ```

## API Endpoints

The API Gateway exposes the following endpoints:

### User Service
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get a specific user
- `POST /api/users` - Create a new user
- `PUT /api/users/:id` - Update a user
- `DELETE /api/users/:id` - Delete a user

### Product Service
- `GET /api/products` - List all products
- `GET /api/products/:id` - Get a specific product
- `POST /api/products` - Create a new product
- `PUT /api/products/:id` - Update a product
- `DELETE /api/products/:id` - Delete a product

### Order Service
- `GET /api/orders` - List all orders
- `GET /api/orders/:id` - Get a specific order
- `POST /api/orders` - Create a new order
- `PUT /api/orders/:id` - Update an order status
- `DELETE /api/orders/:id` - Delete an order

## Features

- **Scalability**: Services can be scaled independently based on demand
- **Resilience**: Fault isolation between services
- **Service Discovery**: Automatic service registration and discovery
- **Load Balancing**: Requests are distributed across service instances
- **API Gateway**: Single entry point for all client requests
- **gRPC Communication**: Efficient inter-service communication
- **Containerization**: Docker containers for consistent deployment
- **Orchestration**: Kubernetes for container management and scaling

## Architecture Diagram

```
┌─────────────┐
│             │
│   Clients   │
│             │
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