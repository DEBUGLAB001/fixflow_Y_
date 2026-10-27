import { performance } from 'node:perf_hooks';
import { tests } from './tests.js';

async function run() {
  const globalStart = performance.now();
  const results = {};
  let passedCount = 0;
  let failedCount = 0;
  const totalBugs = 6;

  const testEntries = Object.entries(tests);

  for (const [name, fn] of testEntries) {
    const start = performance.now();
    try {
      await fn();
      const duration = Math.round(performance.now() - start);
      results[name] = {
        Status: 'passed',
        'Execution time': `${duration}ms`
      };
      passedCount++;
    } catch (err) {
      const duration = Math.round(performance.now() - start);
      results[name] = {
        Status: 'failed',
        'Execution time': `${duration}ms`,
        Error: err.message
      };
      failedCount++;
    }
  }

  const totalDuration = Math.round(performance.now() - globalStart);

  results.Passed = passedCount;
  results.Failed = failedCount;
  results['Total bugs'] = totalBugs;
  results['Total Execution time'] = `${totalDuration}ms`;

  // Output STRICT valid JSON only to stdout
  process.stdout.write(JSON.stringify(results, null, 2) + '\n');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  process.stderr.write(`Test runner crashed: ${err.stack}\n`);
  process.exit(1);
});
