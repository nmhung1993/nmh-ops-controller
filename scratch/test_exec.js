const net = require('net');
const http = require('http');

async function test() {
  const socketPath = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
  
  // 1. List running container
  const req = http.request({
    socketPath,
    path: '/containers/json?all=0',
    method: 'GET'
  }, (res) => {
    let raw = '';
    res.on('data', c => raw += c);
    res.on('end', async () => {
      const list = JSON.parse(raw);
      if (!list.length) {
        console.log('No running containers');
        return;
      }
      const c = list[0];
      console.log('Target container:', c.Names[0], c.Id);

      // 2. Create exec
      const execReq = http.request({
        socketPath,
        path: `/containers/${c.Id}/exec`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (execRes) => {
        let execRaw = '';
        execRes.on('data', ch => execRaw += ch);
        execRes.on('end', () => {
          const execData = JSON.parse(execRaw);
          console.log('Exec created:', execData);
          const execId = execData.Id;

          // 3. Start exec via raw socket
          const body = JSON.stringify({ Detach: false, Tty: true });
          const socket = net.connect(socketPath);
          socket.once('connect', () => {
            const header = [
              `POST /exec/${execId}/start HTTP/1.1`,
              `Host: localhost`,
              `Content-Type: application/json`,
              `Connection: Upgrade`,
              `Upgrade: tcp`,
              `Content-Length: ${Buffer.byteLength(body)}`,
              ``,
              body
            ].join('\r\n');

            console.log('Writing request...');
            socket.write(header);

            socket.on('data', (data) => {
              console.log('Received data from container:', data.toString('utf8'));
            });

            setTimeout(() => {
              console.log('Sending command "echo Hello Docker Exec"');
              socket.write('echo Hello Docker Exec\n');
            }, 1000);

            setTimeout(() => {
              socket.end();
            }, 3000);
          });
        });
      });
      execReq.write(JSON.stringify({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Cmd: ['/bin/sh']
      }));
      execReq.end();
    });
  });
  req.end();
}

test().catch(console.error);
