// Setup basic express server
var express = require('express');
var app = express();
var path = require('path');
var server = require('http').createServer(app);
var Presence = require('./lib/presence');

const { Server } = require('socket.io');
const redisAdapter = require('socket.io-redis');

const io = new Server(server, {
  pingTimeout: 8000,
  pingInterval: 4000
});

// Use Redis adapter
io.adapter(redisAdapter({ host: '3.1.218.79', port: 6379 }));

var port = process.env.PORT || 3000;

server.listen(port, function() {
  console.log('Server listening at port %d', port);
});

// Routing
app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', function(socket) {
  var addedUser = false;

  // when the client emits 'new message', this listens and executes
  socket.on('new message', function(data) {
    // we tell the client to execute 'new message'
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

  // when the client emits 'add user', this listens and executes
  socket.on('add user', function(username) {
    if (addedUser) {
      return;
    }

    // we store the username in the socket session for this client
    socket.username = username;
    Presence.upsert(socket.id, {
      username: socket.username
    });
    addedUser = true;

    Presence.list(function(users) {
      socket.emit('login', {
        numUsers: users.length
      });

      // echo globally (all clients) that a person has connected
      socket.broadcast.emit('user joined', {
        username: socket.username,
        numUsers: users.length
      });
    });
  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', function() {
    socket.broadcast.emit('typing', {
      username: socket.username
    });
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', function() {
    socket.broadcast.emit('stop typing', {
      username: socket.username
    });
  });

  // when the user disconnects.. perform this
  socket.on('disconnect', function() {
    if (addedUser) {
      Presence.remove(socket.id);

      Presence.list(function(users) {
        // echo globally (all clients) that a person has disconnected
        socket.broadcast.emit('user left', {
          username: socket.username,
          numUsers: users.length
        });
      });
    }
  });
});
