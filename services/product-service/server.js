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

// Load Product model
const Product = require('./models/product');

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
const PROTO_PATH = '../../protos/product.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const productProto = grpc.loadPackageDefinition(packageDefinition).product;

// Implement service methods
const getProduct = async (call, callback) => {
  try {
    const product = await Product.findById(call.request.id);
    if (!product) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Product not found'
      });
    }
    callback(null, product.toObject());
  } catch (error) {
    logger.error(`Error in getProduct: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

const createProduct = async (call, callback) => {
  try {
    const product = new Product({
      name: call.request.name,
      description: call.request.description,
      price: call.request.price,
      stock: call.request.stock
    });
    await product.save();
    logger.info(`Created new product: ${product.id}`);
    callback(null, product.toObject());
  } catch (error) {
    logger.error(`Error in createProduct: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

const updateProduct = async (call, callback) => {
  try {
    const product = await Product.findByIdAndUpdate(
      call.request.id,
      {
        name: call.request.name,
        description: call.request.description,
        price: call.request.price,
        stock: call.request.stock
      },
      { new: true }
    );
    if (!product) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Product not found'
      });
    }
    logger.info(`Updated product: ${product.id}`);
    callback(null, product.toObject());
  } catch (error) {
    logger.error(`Error in updateProduct: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

const deleteProduct = async (call, callback) => {
  try {
    const product = await Product.findByIdAndDelete(call.request.id);
    if (!product) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'Product not found'
      });
    }
    logger.info(`Deleted product: ${call.request.id}`);
    callback(null, { success: true });
  } catch (error) {
    logger.error(`Error in deleteProduct: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

const listProducts = async (call, callback) => {
  try {
    const page = call.request.page || 1;
    const limit = call.request.limit || 10;
    const skip = (page - 1) * limit;

    const products = await Product.find().skip(skip).limit(limit);
    const total = await Product.countDocuments();

    logger.info(`Listed products: ${products.length} of ${total}`);
    callback(null, {
      products: products.map(product => product.toObject()),
      total
    });
  } catch (error) {
    logger.error(`Error in listProducts: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

// Start gRPC server
const startServer = () => {
  const server = new grpc.Server();
  server.addService(productProto.ProductService.service, {
    getProduct,
    createProduct,
    updateProduct,
    deleteProduct,
    listProducts
  });

  const PORT = process.env.PRODUCT_SERVICE_PORT || 3002;
  const HOST = process.env.PRODUCT_SERVICE_HOST || 'localhost';
  
  server.bindAsync(`${HOST}:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      logger.error(`Failed to bind server: ${err.message}`);
      return;
    }
    
    server.start();
    logger.info(`Product service running at ${HOST}:${PORT}`);
    
    // Register with Consul if available
    if (consulAvailable && consul) {
      consul.agent.service.register({
        name: 'product-service',
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
    logger.info('Shutting down product service');
    server.tryShutdown(() => {
      if (consulAvailable && consul) {
        consul.agent.service.deregister('product-service')
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