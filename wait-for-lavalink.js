const net = require('net');

const LAVALINK_HOST = process.env.LAVALINK_HOST || 'lavalink';
const LAVALINK_PORT = parseInt(process.env.LAVALINK_PORT || '2333', 10);
const MAX_RETRIES = 60;
const RETRY_INTERVAL = 5000;

function checkLavalink() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(LAVALINK_PORT, LAVALINK_HOST);
  });
}

async function waitForLavalink() {
  console.log(`[STARTUP] Waiting for Lavalink at ${LAVALINK_HOST}:${LAVALINK_PORT}...`);

  for (let i = 1; i <= MAX_RETRIES; i++) {
    const ready = await checkLavalink();
    if (ready) {
      console.log('[STARTUP] Lavalink is ready. Starting bot...');
      return;
    }
    console.log(`[STARTUP] Lavalink not ready (attempt ${i}/${MAX_RETRIES}), retrying in ${RETRY_INTERVAL}ms...`);
    await new Promise(r => setTimeout(r, RETRY_INTERVAL));
  }

  console.error('[STARTUP] Lavalink did not become ready in time. Starting bot anyway...');
}

waitForLavalink().then(() => {
  const { spawn } = require('child_process');
  const bot = spawn('node', ['dist/index.js'], {
    stdio: 'inherit',
    env: { ...process.env }
  });
  bot.on('exit', (code) => process.exit(code));
});
