import { defineConfig } from 'vitest/config';




export default defineConfig({
  test: {
    // A few property and load tests (hundreds of signatures, 100 parallel submissions) take
    // 2 to 6 seconds on a busy machine. The 5-second default made them fail at random.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Every request writes one access-log line. Tests that check logs spy on
    // console.info directly; the rest would only drown real failures.
    onConsoleLog: (log) => !log.includes('"event":"http.request"'),
  },
});
