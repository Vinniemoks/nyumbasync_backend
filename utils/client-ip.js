// On Fly, every request reaches the app through Fly's proxy, so req.ip is a
// proxy address. Fly sets Fly-Client-IP to the real client, which a client
// cannot supply itself (the app is only reachable through that proxy).
// Elsewhere this does nothing, so the header can't be spoofed.
const net = require('net');

function applyFlyClientIp(req, _res, next) {
  const ip = String(req.headers['fly-client-ip'] || '').trim();
  if (process.env.FLY_APP_NAME && net.isIP(ip)) {
    Object.defineProperty(req, 'ip', { value: ip, configurable: true });
  }
  next();
}

module.exports = { applyFlyClientIp };
