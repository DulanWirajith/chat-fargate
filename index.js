// Setup basic express server
const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');
const Presence = require('./lib/presence');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  pingTimeout: 8000,
  pingInterval: 4000
});

// Create Redis clients for the adapter (one for pub, one for sub)
const pubClient = createClient({ url: 'redis://3.1.218.79:6379' });
const subClient = pubClient.duplicate();

// Connect Redis clients
Promise.all([pubClient.connect(), subClient.connect()])
  .then(() => {
    // Use the Redis adapter
    io.adapter(createAdapter(pubClient, subClient));
    console.log('Redis adapter connected');
  })
  .catch(err => {
    console.error('Redis connection error:', err);
  });

const port = process.env.PORT || 3000;

server.listen(port, function() {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', function(socket) {
  let addedUser = false;

  // When the client emits 'new message', this listens and executes
  socket.on('new message', function(data) {
    // We tell the client to execute 'new message'
    socket.broadcast.emit('new message', {
      username: socket.username,
      message: data
    });
  });

  socket.conn.on('heartbeat', function() {
    if (!addedUser) {
      // Don't start upserting until the user has added themselves.
      return;
    }

    Presence.upsert(socket.id, {
      username: socket.username
    });
  });

  // When the client emits 'add user', this listens and executes
  socket.on('add user', function(username) {
    if (addedUser) {
      return;
    }

    // We store the username in the socket session for this client
    socket.username = username;
    Presence.upsert(socket.id, {
      username: socket.username
    });
    addedUser = true;

    Presence.list(function(users) {
      socket.emit('login', {
        numUsers: users.length
      });

      // Echo globally (all clients) that a person has connected
      socket.broadcast.emit('user joined', {
        username: socket.username,
        numUsers: users.length
      });
    });
  });

  // When the client emits 'typing', we broadcast it to others
  socket.on('typing', function() {
    socket.broadcast.emit('typing', {
      username: socket.username
    });
  });

  // When the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', function() {
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  // When the user disconnects, perform this
  socket.on('disconnect', function() {
    if (addedUser) {
      Presence.remove(socket.id);

      Presence.list(function(users) {
        // Echo globally (all clients) that a person has disconnected
        socket.broadcast.emit('user left', {
          username: socket.username,
          numUsers: users.length
        });
      });
    }
  });
});
