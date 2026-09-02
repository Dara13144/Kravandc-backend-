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

  // Movie Stream / Page Room with Live Concurrent Viewers
  socket.on('watch_movie', (movieId) => {
    if (!movieId) return;
    const roomName = `movie_${movieId}`;
    socket.join(roomName);
    socket.currentMovieRoom = roomName;
    socket.currentMovieId = movieId;

    const liveCount = io.sockets.adapter.rooms.get(roomName)?.size || 1;
    console.log(`[Socket.io] User watching ${roomName} (Active Viewers: ${liveCount})`);
    io.to(roomName).emit('live_viewers_update', { movieId, liveViewers: liveCount });
  });

  socket.on('leave_movie', (movieId) => {
    if (!movieId) return;
    const roomName = `movie_${movieId}`;
    socket.leave(roomName);
    const liveCount = io.sockets.adapter.rooms.get(roomName)?.size || 0;
    io.to(roomName).emit('live_viewers_update', { movieId, liveViewers: liveCount });
  });

  socket.on('disconnect', () => {
    if (socket.currentMovieRoom) {
      const liveCount = io.sockets.adapter.rooms.get(socket.currentMovieRoom)?.size || 0;
      io.to(socket.currentMovieRoom).emit('live_viewers_update', {
        movieId: socket.currentMovieId,
        liveViewers: liveCount
      });
    }
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

const paymentCheckWorker = require('./services/paymentCheckWorker');

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ======================================================
   🎬 KRAVANDC.COM BACKEND API SERVER RUNNING 🎬
  ======================================================
   - URL: http://0.0.0.0:${PORT}
   - Environment: ${process.env.NODE_ENV || 'development'}
   - Health Check: http://0.0.0.0:${PORT}/api/health
  ======================================================
  `);

  // Start background payment status checking worker
  try {
    paymentCheckWorker.start();
  } catch (err) {
    console.warn('[Payment Worker Warning]:', err.message);
  }
});

// Graceful Cloud Shutdown Handlers (Render, Railway, Docker, Kubernetes)
const handleGracefulShutdown = (signal) => {
  console.log(`[Server] Received ${signal}. Gracefully closing HTTP and WebSocket connections...`);
  try {
    paymentCheckWorker.stop();
  } catch (e) {}

  server.close(() => {
    console.log('[Server] Closed HTTP & WebSocket server cleanly.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(0);
  }, 5000);
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process Unhandled Rejection]:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process Uncaught Exception]:', err);
});
