import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessHostMode,
  isLoopbackAddress,
  isLoopbackHostname,
  isPrivateLanIpHost,
} from './accessControl.js';

test('allows localhost loopback requests on teacher laptop', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true);
  assert.equal(isLoopbackHostname('localhost:3000'), true);
  assert.equal(
    canAccessHostMode({
      remoteAddress: '::ffff:127.0.0.1',
      hostHeader: 'localhost:3000',
      isCloudPreview: false,
    }),
    true
  );
  assert.equal(
    canAccessHostMode({
      remoteAddress: '127.0.0.1',
      hostHeader: '127.0.0.1:3000',
      isCloudPreview: false,
    }),
    true
  );
});

test('blocks student phones accessing via LAN IP', () => {
  assert.equal(isPrivateLanIpHost('192.168.1.10:3000'), true);
  assert.equal(isPrivateLanIpHost('10.0.0.5:3000'), true);
  assert.equal(isPrivateLanIpHost('172.16.4.2:3000'), true);

  assert.equal(
    canAccessHostMode({
      remoteAddress: '::ffff:192.168.1.45',
      hostHeader: '192.168.1.10:3000',
      isCloudPreview: false,
    }),
    false
  );
  assert.equal(
    canAccessHostMode({
      remoteAddress: '192.168.1.45',
      hostHeader: 'localhost:3000',
      isCloudPreview: false,
    }),
    false
  );
  assert.equal(
    canAccessHostMode({
      remoteAddress: '127.0.0.1',
      hostHeader: '192.168.1.10:3000',
      isCloudPreview: false,
    }),
    false
  );
});

test('allows Cloud Run preview domain only when isCloudPreview is true', () => {
  assert.equal(
    canAccessHostMode({
      remoteAddress: '10.128.0.5',
      hostHeader: 'ais-dev-demo.asia-northeast1.run.app',
      isCloudPreview: true,
    }),
    true
  );
  assert.equal(
    canAccessHostMode({
      remoteAddress: '10.128.0.5',
      hostHeader: 'ais-dev-demo.asia-northeast1.run.app',
      isCloudPreview: false,
    }),
    false
  );
});
