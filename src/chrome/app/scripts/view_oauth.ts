/**
 * Hackety hack. Used by:
 *  - Google XMPP
 *  - Manual identity
 **/
/// <reference path='plumbing.ts'/>

declare var connector :ChromeUIConnector;

var EXTENSION_ID = 'opedeinldpclhihojdgahbpjnndkfmhe';

var View_oauth = function(app, dispatchEvent) {
  this.dispatchEvent = dispatchEvent;
  this.authMan = null;
  this.manualDialog = null;
  this.socialNetworkName = null;
  if (app.manifest.name == 'Google Social Provider') {
    this.socialNetworkName = 'Google';
  }
};

View_oauth.prototype.open = function(args, what, continuation) {
  // args and what are currently ignored, since they are always
  // ('XMPPLogin', {file: 'login.html'}) as set by freedom-social-xmpp's
  // socialprovider.js
  if (this.socialNetworkName == "Google") {
    connector.sendToUI(uProxy.Update.GET_CREDENTIALS, 'Google');
    connector.setOnCredentials((results) => {
      this.dispatchEvent('message', results);
    });
  }
  /* TODO: these social network's haven't yet been fully implemented
  else if (this.socialNetworkName == "xmpp") {
    this.authMan = new AuthXmpp(this.dispatchAuth.bind(this), this.dispatchError.bind(this));
  }
  else if (this.socialNetworkName == 'facebook') {
    this.authMan = new AuthFacebook(this.dispatchAuth.bind(this), this.dispatchError.bind(this));
  } else if (this.socialNetworkName == 'manual') {
    this.manualDialog = new ManualDialog((function(msg) {
      this.dispatchEvent('message', {cmd: 'manual-msg', message: msg});
    }).bind(this));
  }
  */
  else {
    console.warn("Authentication view provider asked to serve unknown social network: " +
                 this.socialNetworkName);
  }
  continuation();
};

View_oauth.prototype.show = function(continuation) {
  continuation();
};

View_oauth.prototype.postMessage = function(args, continuation) {
  console.error("Unrecognized message to core.view: " + JSON.stringify(args));
  continuation();
};

View_oauth.prototype.close = function(continuation) {
  continuation();
};

/**
 *INTERNAL METHODS
 */
