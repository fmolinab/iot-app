const WebSocket = require('ws');
const readline = require('readline');

const ws = new WebSocket('ws://127.0.0.1:1880/ws/device');
const DEVICE_ID = 'mock-hourglass-001';

function send(data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  console.log('Sending:', payload);
  ws.send(payload);
}

function sendPosition(position) {
  if (position === 'a') {
    console.log('Position A: upright/start');
    send('I0,0,9.8,0,0,0');
  } else if (position === 'c') {
    console.log('Position C: horizontal/pause');
    send('I9.8,0,0,0,0,0');
  } else if (position === 'b') {
    console.log('Position B: flipped/complete');
    send('I0,0,-9.8,0,0,0');
  } else {
    console.log('Use: a = start, c = pause, b = complete, q = quit');
  }
}

ws.on('open', () => {
  console.log('Mock device connected to NodeRED');

  send({
    type: 'device_registration',
    device: DEVICE_ID,
    device_name: 'Mock Hourglass',
    device_type: 'ESP32',
    library: 'mock',
    version: '1.0',
    ip: '127.0.0.1',
    sensors: [{ name: 'imu', type: 'imu', data_type: 'object' }],
    actuators: [{ name: 'led', type: 'led', data_type: 'boolean' }]
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\nType a, b, or c then Enter:');
  console.log('a = Position A / Start');
  console.log('c = Position C / Pause');
  console.log('b = Position B / Complete');
  console.log('q = Quit\n');

  rl.on('line', (input) => {
    const command = input.trim().toLowerCase();

    if (command === 'q') {
      console.log('Closing mock device...');
      rl.close();
      ws.close();
      process.exit(0);
    }

    sendPosition(command);
  });
});

ws.on('message', (msg) => {
  console.log('Received from NodeRED:', msg.toString());
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

ws.on('close', () => {
  console.log('Mock device disconnected');
});