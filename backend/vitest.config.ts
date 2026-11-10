import { defineConfig } from 'vitest/config';




export default defineConfig({
  test: {
    // Every request writes one access-log line. Tests that check logs spy on
    // console.info directly; the rest would only drown real failures.
    onConsoleLog: (log) => !log.includes('"event":"http.request"'),
  },
});
