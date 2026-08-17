const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const testDir = path.join(__dirname, 'e2e');
const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js')).sort();

console.log('='.repeat(60));
console.log('🚀 RUNNING FULL PLAYWRIGHT E2E TEST SUITE');
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

async function runTest(file) {
  return new Promise((resolve) => {
    const fullPath = path.join(testDir, file);
    const proc = spawn('node', ['--test', fullPath], { stdio: 'inherit', env: process.env });

    proc.on('close', (code) => {
      if (code === 0) {
        passed++;
        resolve(true);
      } else {
        failed++;
        resolve(false);
      }
    });
  });
}

(async () => {
  for (const file of testFiles) {
    console.log(`\n▶ Running: ${file}...`);
    await runTest(file);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${testFiles.length})`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
})();
