const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const mongoose = require('mongoose');
const Consul = require('consul');
const dotenv = require('dotenv');
const winston = require('winston');

// Load environment variables
dotenv.config();

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

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/microservices')
  .then(() => logger.info('Connected to MongoDB'))
  .catch(err => logger.error('Could not connect to MongoDB', err));

// Load Order model
const Order = require('./models/order');

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
      logger.warn(`Consul not available: ${err.message}. Running without service registration.`);
    });
} catch (error) {
  logger.warn(`Failed to initialize Consul: ${error.message}. Running without service registration.`);
}

// Load protobuf
const PROTO_PATH = '../../protos/order.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const orderProto = grpc.loadPackageDefinition(packageDefinition).order;

// Create gRPC clients for other services with fallback mechanism
const createGrpcClient = (serviceName, protoPath, packageName) => {
  const packageDef = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
  });
  const proto = grpc.loadPackageDefinition(packageDef)[packageName];
  
  // If Consul is not available, use direct connection
  if (!consulAvailable) {
    let address;
    switch (serviceName) {
      case 'user-service':
        address = `${process.env.USER_SERVICE_HOST || 'localhost'}:${process.env.USER_SERVICE_PORT || 3001}`;
        break;
      case 'product-service':
        address = `${process.env.PRODUCT_SERVICE_HOST || 'localhost'}:${process.env.PRODUCT_SERVICE_PORT || 3002}`;
        break;
      default:
        throw new Error(`Unknown service: ${serviceName}`);
    }
    
    logger.info(`Creating direct gRPC client for ${serviceName} at ${address}`);
    return Promise.resolve(
      new proto[`${packageName.charAt(0).toUpperCase() + packageName.slice(1)}Service`](
        address,
        grpc.credentials.createInsecure()
      )
    );
  }
  
  // If Consul is available, use service discovery
  return new Promise((resolve, reject) => {
    consul.catalog.service.nodes(serviceName)
      .then(result => {
        if (!result || result.length === 0) {
          throw new Error(`Service ${serviceName} not found in Consul`);
        }
        
        // Simple load balancing - random selection
        const service = result[Math.floor(Math.random() * result.length)];
        const address = `${service.ServiceAddress}:${service.ServicePort}`;
        
        logger.info(`Creating gRPC client for ${serviceName} at ${address} via Consul`);
        const client = new proto[`${packageName.charAt(0).toUpperCase() + packageName.slice(1)}Service`](
          address,
          grpc.credentials.createInsecure()
        );
        resolve(client);
      })
      .catch(err => {
        logger.error(`Error discovering service ${serviceName}: ${err.message}`);
        
        // Fallback to direct connection
        let address;
        switch (serviceName) {
          case 'user-service':
            address = `${process.env.USER_SERVICE_HOST || 'localhost'}:${process.env.USER_SERVICE_PORT || 3001}`;
            break;
          case 'product-service':
            address = `${process.env.PRODUCT_SERVICE_HOST || 'localhost'}:${process.env.PRODUCT_SERVICE_PORT || 3002}`;
            break;
          default:
            reject(new Error(`Unknown service: ${serviceName}`));
            return;
        }
        
        logger.info(`Falling back to direct gRPC client for ${serviceName} at ${address}`);
        resolve(
          new proto[`${packageName.charAt(0).toUpperCase() + packageName.slice(1)}Service`](
            address,
            grpc.credentials.createInsecure()
          )
        );
      });
  });
};

// Implement service methods
const getOrder = async (call, callback) => {
  try {
    const order = await Order.findById(call.request.id);
    if (!order) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Order not found'
      });
    }
    callback(null, order.toObject());
  } catch (error) {
    logger.error(`Error in getOrder: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

const createOrder = async (call, callback) => {
  try {
    // Validate user exists
    const userClient = await createGrpcClient('user-service', '../../protos/user.proto', 'user');
    
    // Validate products and calculate total
    const productClient = await createGrpcClient('product-service', '../../protos/product.proto', 'product');
    
    let totalAmount = 0;
    const items = [];
    
    // Process each order item
    for (const item of call.request.items) {
      const productPromise = new Promise((resolve, reject) => {
        productClient.getProduct({ id: item.product_id }, (err, product) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Check stock
          if (product.stock < item.quantity) {
            reject(new Error(`Not enough stock for product ${product.name}`));
            return;
          }
          
          const itemTotal = product.price * item.quantity;
          totalAmount += itemTotal;
          
          items.push({
            product_id: item.product_id,
            quantity: item.quantity,
            price: product.price
          });
          
          resolve();
        });
      });
      
      await productPromise;
    }
    
    // Create the order
    const order = new Order({
      user_id: call.request.user_id,
      items: items,
      total_amount: totalAmount,
      status: 'pending',
      shipping_address: call.request.shipping_address
    });
    
    await order.save();
    logger.info(`Created new order: ${order.id}`);
    callback(null, order.toObject());
  } catch (error) {
    logger.error(`Error in createOrder: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

const updateOrder = async (call, callback) => {
  try {
    const order = await Order.findByIdAndUpdate(
      call.request.id,
      { status: call.request.status },
      { new: true }
    );
    
    if (!order) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Order not found'
      });
    }
    
    logger.info(`Updated order status: ${order.id} to ${call.request.status}`);
    callback(null, order.toObject());
  } catch (error) {
    logger.error(`Error in updateOrder: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

const deleteOrder = async (call, callback) => {
  try {
    const order = await Order.findByIdAndDelete(call.request.id);
    if (!order) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Order not found'
      });
    }
    logger.info(`Deleted order: ${call.request.id}`);
    callback(null, { success: true });
  } catch (error) {
    logger.error(`Error in deleteOrder: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

const listOrders = async (call, callback) => {
  try {
    const page = call.request.page || 1;
    const limit = call.request.limit || 10;
    const skip = (page - 1) * limit;
    
    const query = {};
    if (call.request.user_id) {
      query.user_id = call.request.user_id;
    }
    
    const orders = await Order.find(query).skip(skip).limit(limit);
    const total = await Order.countDocuments(query);
    
    logger.info(`Listed orders: ${orders.length} of ${total}`);
    callback(null, {
      orders: orders.map(order => order.toObject()),
      total
    });
  } catch (error) {
    logger.error(`Error in listOrders: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

// Start gRPC server
const startServer = () => {
  const server = new grpc.Server();
  server.addService(orderProto.OrderService.service, {
    getOrder,
    createOrder,
    updateOrder,
    deleteOrder,
    listOrders
  });

  const PORT = process.env.ORDER_SERVICE_PORT || 3003;
  const HOST = process.env.ORDER_SERVICE_HOST || 'localhost';
  
  server.bindAsync(`${HOST}:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      logger.error(`Failed to bind server: ${err.message}`);
      return;
    }
    
    server.start();
    logger.info(`Order service running at ${HOST}:${PORT}`);
    
    // Register with Consul if available
    if (consulAvailable && consul) {
      consul.agent.service.register({
        name: 'order-service',
        address: HOST,
        port: parseInt(PORT, 10),
        check: {
          tcp: `${HOST}:${PORT}`,
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
  const shutdown = () => {
    logger.info('Shutting down order service');
    server.tryShutdown(() => {
      if (consulAvailable && consul) {
        consul.agent.service.deregister('order-service')
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
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

startServer();