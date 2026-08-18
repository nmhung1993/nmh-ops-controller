const test = require('node:test');
const assert = require('node:assert/strict');
const { DockerManager } = require('../server/docker-manager');

test('DockerManager: socket configuration and stream decoding', async (t) => {
  const dm = new DockerManager();

  await t.test('detects local socket or named pipe configuration', () => {
    const config = dm.getSocketConfig();
    assert.ok(config.socketPath || config.host, 'Should produce a valid socket path or host');
  });

  await t.test('decodes multiplexed docker stream packets', () => {
    // Construct fake stdout packet: [1, 0, 0, 0, 0, 0, 0, 11] + "Hello Docker"
    const packet = Buffer.alloc(8 + 12);
    packet[0] = 1; // stdout
    packet.writeUInt32BE(12, 4); // 12 bytes
    packet.write('Hello Docker', 8, 'utf8');

    const decoded = dm.demuxDockerStream(packet);
    assert.match(decoded, /Hello Docker/);
  });

  await t.test('handles plain string or non-buffer stream gracefully', () => {
    assert.strictEqual(dm.demuxDockerStream('raw text output'), 'raw text output');
  });

  await t.test('validates unsupported container actions', async () => {
    await assert.rejects(async () => {
      // If docker is available, it should reject invalid action
      await dm.containerAction('test-id', 'invalid_action');
    }, /Docker is not available|Unsupported container action/);
  });
});
