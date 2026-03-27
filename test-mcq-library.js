const { spawn } = require('child_process');
const http = require('http');
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function makeRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 7778,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting server on port 7778...');

  const serverProcess = spawn('node', ['server.js'], {
    cwd: '/c/Users/rambe/Desktop/vivamed',
    env: { ...process.env, PORT: '7778' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverReady = false;
  serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('[SERVER]', output.trim());
    if (output.includes('running on') || output.includes('Server running')) {
      serverReady = true;
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.log('[SERVER ERROR]', data.toString().trim());
  });

  // Wait for server to start
  console.log('⏳ Waiting for server to start...');
  for (let i = 0; i < 15; i++) {
    try {
      const health = await makeRequest('GET', '/health');
      if (health.status === 200) {
        console.log('✅ Server is ready!');
        break;
      }
    } catch (e) {
      if (i === 14) {
        console.error('❌ Server failed to start');
        serverProcess.kill();
        process.exit(1);
      }
    }
    await wait(1000);
  }

  try {
    console.log('\n' + '='.repeat(80));
    console.log('TEST 1: POST /mcq-question (difficulty=medium)');
    console.log('='.repeat(80));
    const resp1 = await makeRequest('POST', '/mcq-question', {
      sessionId: 'library-test-final',
      difficulty: 'medium'
    });
    console.log('Status:', resp1.status);
    console.log('Question:', resp1.data.question?.substring(0, 100) + '...');
    console.log('Source:', resp1.data.source || 'unknown');
    console.log('Question Type:', resp1.data.questionType);

    await wait(1000);

    console.log('\n' + '='.repeat(80));
    console.log('TEST 2: POST /mcq-question (second request - should be different)');
    console.log('='.repeat(80));
    const resp2 = await makeRequest('POST', '/mcq-question', {
      sessionId: 'library-test-final',
      difficulty: 'medium'
    });
    console.log('Status:', resp2.status);
    console.log('Question:', resp2.data.question?.substring(0, 100) + '...');
    console.log('Source:', resp2.data.source || 'unknown');
    console.log('Different from Q1?', resp1.data.question !== resp2.data.question ? '✅ YES' : '❌ NO');

    await wait(1000);

    console.log('\n' + '='.repeat(80));
    console.log('TEST 3: POST /mcq-question (third request - should be different)');
    console.log('='.repeat(80));
    const resp3 = await makeRequest('POST', '/mcq-question', {
      sessionId: 'library-test-final',
      difficulty: 'medium'
    });
    console.log('Status:', resp3.status);
    console.log('Question:', resp3.data.question?.substring(0, 100) + '...');
    console.log('Source:', resp3.data.source || 'unknown');
    console.log('Different from Q1 & Q2?', (resp1.data.question !== resp3.data.question && resp2.data.question !== resp3.data.question) ? '✅ YES' : '❌ NO');

    await wait(1000);

    console.log('\n' + '='.repeat(80));
    console.log('TEST 4: POST /mcq-question (fourth request - should be different)');
    console.log('='.repeat(80));
    const resp4 = await makeRequest('POST', '/mcq-question', {
      sessionId: 'library-test-final',
      difficulty: 'medium'
    });
    console.log('Status:', resp4.status);
    console.log('Question:', resp4.data.question?.substring(0, 100) + '...');
    console.log('Source:', resp4.data.source || 'unknown');
    console.log('Different from Q1, Q2 & Q3?', (resp1.data.question !== resp4.data.question && resp2.data.question !== resp4.data.question && resp3.data.question !== resp4.data.question) ? '✅ YES' : '❌ NO');

    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));
    console.log('All sources are from library?',
      resp1.data.source === 'library' && resp2.data.source === 'library' &&
      resp3.data.source === 'library' && resp4.data.source === 'library' ? '✅ YES' : '⚠️  Mixed sources');
    console.log('All questions unique?',
      new Set([resp1.data.question, resp2.data.question, resp3.data.question, resp4.data.question]).size === 4 ? '✅ YES' : '❌ NO - Duplicates found');

  } catch (err) {
    console.error('Test error:', err.message);
  } finally {
    console.log('\n🛑 Stopping server...');
    serverProcess.kill();
    await wait(1000);
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
