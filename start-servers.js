const { spawn } = require('child_process');
const path = require('path');

console.log("Starting Backend Server...");

const backend = spawn('node', ['server.js'], {
  cwd: path.join(__dirname, 'backend'),
  env: { ...process.env, MONGO_URI: 'mongodb://127.0.0.1:27017/campus-event-hub' },
  shell: true,
  detached: true
});

backend.stdout.on('data', (data) => {
  console.log(`Backend: ${data}`);
});

backend.stderr.on('data', (data) => {
  console.error(`Backend Error: ${data}`);
});

setTimeout(() => {
  console.log("\nStarting Angular Frontend...");
  
  const frontend = spawn('npm', ['start'], {
    cwd: path.join(__dirname),
    shell: true,
    detached: true
  });

  frontend.stdout.on('data', (data) => {
    console.log(`Frontend: ${data}`);
  });

  frontend.stderr.on('data', (data) => {
    console.error(`Frontend Error: ${data}`);
  });
  
  frontend.unref();
}, 3000);

backend.unref();

console.log("Servers starting...");
