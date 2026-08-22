const http = require('http');
const dotenv = require('dotenv');
dotenv.config();

const app = require('./app');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Socket.io for live updates (e.g. payment success notification)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

global.io = io;

io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`[Socket.io] Socket ${socket.id} joined room user_${userId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

const paymentCheckWorker = require('./services/paymentCheckWorker');

server.listen(PORT, () => {
  console.log(`
  ======================================================
   🎬 KV DIGITAL CINEMA BACKEND SERVER RUNNING 🎬
  ======================================================
   - URL: http://localhost:${PORT}
   - Environment: ${process.env.NODE_ENV || 'development'}
   - Health Check: http://localhost:${PORT}/api/health
  ======================================================
  `);

  // Start background payment status checking worker
  paymentCheckWorker.start();
});
