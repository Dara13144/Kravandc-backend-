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

server.listen(PORT, () => {
  console.log(`
  ======================================================
   🎬 KRAVANDC.COM BACKEND API SERVER RUNNING 🎬
  ======================================================
   - URL: http://localhost:${PORT}
   - Environment: ${process.env.NODE_ENV || 'development'}
   - Health Check: http://localhost:${PORT}/api/health
  ======================================================
  `);

  // Start background payment status checking worker
  paymentCheckWorker.start();
});
