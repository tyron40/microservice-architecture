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

// Load User model
const User = require('./models/user');

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
const PROTO_PATH = '../../protos/user.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const userProto = grpc.loadPackageDefinition(packageDefinition).user;

// Implement service methods
const getUser = async (call, callback) => {
  try {
    const user = await User.findById(call.request.id);
    if (!user) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'User not found'
      });
    }
    callback(null, user.toObject());
  } catch (error) {
    logger.error(`Error in getUser: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

const createUser = async (call, callback) => {
  try {
    const user = new User({
      name: call.request.name,
      email: call.request.email,
      password: call.request.password // In a real app, hash this password
    });
    await user.save();
    logger.info(`Created new user: ${user.id}`);
    callback(null, user.toObject());
  } catch (error) {
    logger.error(`Error in createUser: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

const updateUser = async (call, callback) => {
  try {
    const user = await User.findByIdAndUpdate(
      call.request.id,
      {
        name: call.request.name,
        email: call.request.email
      },
      { new: true }
    );
    if (!user) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'User not found'
      });
    }
    logger.info(`Updated user: ${user.id}`);
    callback(null, user.toObject());
  } catch (error) {
    logger.error(`Error in updateUser: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

const deleteUser = async (call, callback) => {
  try {
    const user = await User.findByIdAndDelete(call.request.id);
    if (!user) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: 'User not found'
      });
    }
    logger.info(`Deleted user: ${call.request.id}`);
    callback(null, { success: true });
  } catch (error) {
    logger.error(`Error in deleteUser: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

const listUsers = async (call, callback) => {
  try {
    const page = call.request.page || 1;
    const limit = call.request.limit || 10;
    const skip = (page - 1) * limit;

    const users = await User.find().skip(skip).limit(limit);
    const total = await User.countDocuments();

    logger.info(`Listed users: ${users.length} of ${total}`);
    callback(null, {
      users: users.map(user => user.toObject()),
      total
    });
  } catch (error) {
    logger.error(`Error in listUsers: ${error.message}`);
    callback({
      code: grpc.status.INTERNAL,
      message: error.message
    });
  }
};

// Start gRPC server
const startServer = () => {
  const server = new grpc.Server();
  server.addService(userProto.UserService.service, {
    getUser,
    createUser,
    updateUser,
    deleteUser,
    listUsers
  });

  const PORT = process.env.USER_SERVICE_PORT || 3001;
  const HOST = process.env.USER_SERVICE_HOST || 'localhost';
  
  server.bindAsync(`${HOST}:${PORT}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      logger.error(`Failed to bind server: ${err.message}`);
      return;
    }
    
    server.start();
    logger.info(`User service running at ${HOST}:${PORT}`);
    
    // Register with Consul if available
    if (consulAvailable && consul) {
      consul.agent.service.register({
        name: 'user-service',
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
    logger.info('Shutting down user service');
    server.tryShutdown(() => {
      if (consulAvailable && consul) {
        consul.agent.service.deregister('user-service')
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