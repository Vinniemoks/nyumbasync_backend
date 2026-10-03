const { applyFlyClientIp } = require('../../utils/client-ip');

const run = (headers, fly) => {
  const prev = process.env.FLY_APP_NAME;
  if (fly) process.env.FLY_APP_NAME = 'x'; else delete process.env.FLY_APP_NAME;
  const req = { headers, ip: '66.241.125.106' };
  applyFlyClientIp(req, {}, () => {});
  if (prev === undefined) delete process.env.FLY_APP_NAME; else process.env.FLY_APP_NAME = prev;
  return req.ip;
};

describe('applyFlyClientIp', () => {
  test('on Fly, req.ip becomes the Fly-Client-IP', () => {
    expect(run({ 'fly-client-ip': '102.204.4.14' }, true)).toBe('102.204.4.14');
  });
  test('ignores the header off Fly (cannot be spoofed)', () => {
    expect(run({ 'fly-client-ip': '1.2.3.4' }, false)).toBe('66.241.125.106');
  });
  test('ignores a malformed value', () => {
    expect(run({ 'fly-client-ip': 'not-an-ip' }, true)).toBe('66.241.125.106');
  });
});
