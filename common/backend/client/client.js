/*
 * client.js
 *
 * Manages the relationship between a socket-based socks5 _socksServer which passes
 * the requests over WebRTC datachannels to a give identity.
 */

//XXX: needed for chrome debugging, used by socks.js and tcp-server.js.
var window = {};
console.log('SOCKS5 client: ' + self.location.href);

window.socket = freedom['core.socket']();
window.core = freedom.core();

var onload = function() {
  // The socks TCP Server.
  var _socksServer = null;
  // The Freedom sctp-peer connection.
  var _sctpPc = null;
  var _peerId = null;
  // The signalling channel
  var _signallingChannel = null;
  // Each TcpConnection that is active, indexed by it's corresponding sctp
  // channel id.
  var _conns = {};

  var printSelf = function () {
    return JSON.stringify({
        _socksServer: _socksServer,
        _sctpPc: _sctpPc,
        _peerId: _peerId,
        _signallingChannel: _signallingChannel,
        _conns: _conns});
  }

  // Stop running as a _socksServer. Close all connections both to data
  // channels and tcp.
  var shutdown = function() {
    if (_socksServer) {
      _socksServer.tcpServer.disconnect();
      _socksServer = null;
    }
    for (var channelLabel in _conns) {
      onClose(channelLabel, _conns[channelLabel]);
    }
    if(_sctpPc) { _sctpPc.close(); }
    _conns = {};
    _sctpPc = null;
    _peerId = null;
    _signallingChannel = null;
  };

  // Close a particular tcp-connection and data channel pair.
  var closeConnection = function(channelLabel, conn) {
    conn.disconnect();
    _sctpPc.closeDataChannel.bind(_sctpPc, channelLabel);
    delete _conns[channelLabel];
  };

  // A simple wrapper function to send data to the peer.
  var _sendToPeer = function (channelLabel, buffer) {
    console.log("_sendToPeer (buffer) to channelLabel: " + channelLabel);
    _sctpPc.send({'channelLabel': channelLabel, 'buffer': buffer});
  }

  // A SOCKS5 connection request has been received, setup the data channel and
  // start socksServering the corresponding tcp-connection to the data channel.
  var onConnection = function(conn, address, port, connectedCallback) {
    if (!_sctpPc) {
      console.error("onConnection called without a _sctpPc.");
      return;
    }

    // TODO: reuse channelLabels from a pool.
    var channelLabel = "c" + Math.random();
    _conns[channelLabel] = conn.tcpConnection;

    // When the TCP-connection receives data, send it on the sctp peer
    // on the corresponding channelLabel
    conn.tcpConnection.on('recv', _sendToPeer.bind(null, channelLabel));
    // When the TCP-connection closes
    conn.tcpConnection.on('disconnect',
        closeConnection.bind(null, channelLabel));

    _sctpPc.send({'channelLabel' : channelLabel,
                  'text': JSON.stringify({host: address, port: port})},
                 function () {
                   console.log('client.js/onConnection: _sctpPc.send() returned.');
                   connectedCallback({ipAddrString: '127.0.0.1', port: 0});
                 });

    // TODO: we are not connected yet... should we have some message passing
    // back from the other end of the data channel to tell us when it has
    // happened, instead of just pretended?
    // TODO: determine if these need to be accurate.
    // connectedCallback({ipAddrString: '127.0.0.1', port: 0});
  };

  // Set-up a session with a peer.
  freedom.on('start', function(options) {
    console.log('Client: on(start)... ' + JSON.stringify(options));
    _peerId = options.peerId;
    if (!_peerId) {
      console.error('Client: No Peer ID provided! Cannot connect.')
      return false;
    }
    shutdown();  // Reset socks server.
    _socksServer = new window.SocksServer(options.host, options.port, onConnection);
    _socksServer.tcpServer.listen();

    // Create sctp connection to a peer.
    _sctpPc = freedom['core.sctp-peerconnection']();
    _sctpPc.on('onReceived', function(message) {
      if (message.channelLabel) {
        if (message.buffer) {
          _conns[message.channelLabel].sendRaw(message.buffer);
        } else if (message.text) {
          // TODO: we should use text as a signalling/control channel, e.g. to
          // give back the actall address that was connected to as per socks
          // official spec.
          _conns[message.channelLabel].sendRaw(message.text);
        } else {
          console.error("Message type isn't specified properly. Msg: "
            + JSON.stringify(message));
        }
      } else {
        console.error("Message received but missing channelLabel. Msg: "
            + JSON.stringify(message));
      }
    });

    // When WebRTC data-channel transport is closed, shut everything down.
    _sctpPc.on('onCloseDataChannel', closeConnection);

    var _peerId = _peerId;  // Bind peerID to scope so promise can work.
    // Create a freedom-channel to act as the signaling channel.
    window.core.createChannel().done(function(chan) {  // When the signaling channel is created.
      // chan.identifier is a freedom-_socksServer (not a socks _socksServer) for the
      // signalling channel used for signalling.
      console.log('Preparing SCTP peer connection! peerId: ' + _peerId);
      _sctpPc.setup(chan.identifier, "client-to-" + _peerId, true);

      // when the channel is complete, setup handlers.
      chan.channel.done(function(signallingChannel) {
        _signallingChannel = signallingChannel;
        // when the signalling channel gets a message, send that message to the
        // freedom 'fromClient' handlers.
        _signallingChannel.on('message', function(msg) {
          freedom.emit('sendSignalToPeer', {
              peerId: _peerId,
              data: msg
          });
        });

        // When the signalling channel is ready, set the global variable.
        // _signallingChannel.on('ready', function() {});
        console.log('Manually preparing a data channel to catalyze SDP handshake.');
        _sctpPc.openDataChannel('foo', function() {console.log('wheeeee');});
        // _signallingChannel.emit('handleSignalFromPeer');

      });
    });
  });

  // Send any messages from coming from the peer via the signalling channel
  // handled by freedom, to the signalling channel input of the peer connection.
  // msg : {peerId : string, data : json-string}
  freedom.on('handleSignalFromPeer', function(msg) {
      console.log("client handleSignalFromPeer: " + JSON.stringify(msg) +
                  ' with state ' + printSelf());
    if (_signallingChannel) {
      _signallingChannel.emit('message', msg.data);
    } else {
      console.log("Couldn't route incoming signaling message");
    }
  });

  // If we get the 'stop' message, shutdown.
  freedom.on('stop', shutdown);

  // Setup completed, now emit the ready message.
  freedom.emit('ready', {});
};

//TODO(willscott): WebWorker startup errors are hard to debug.
// Once fixed, code can be executed synchronously.
setTimeout(onload, 0);
