import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results.json' }],
    ['list']
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Video recording disabled for better performance
    // video: 'retain-on-failure',
    // Run in headful mode for visual testing (set to true for faster startup)
    headless: false,
    // Optimized timeouts for faster execution
    actionTimeout: 10000, // Reduced from 15000 to 10000
    navigationTimeout: 30000, // Reduced from 60000 to 30000
    // Optimize browser launch for faster startup
    launchOptions: {
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage', // Overcome limited resource problems
        '--disable-extensions', // Disable extensions for faster startup
        '--disable-gpu', // Disable GPU hardware acceleration
        '--disable-software-rasterizer',
        '--disable-web-security', // Only if needed for your tests
        '--no-sandbox', // Bypass OS security model (use with caution)
        '--disable-setuid-sandbox',
        '--disable-background-networking', // Disable background network requests
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-domain-reliability',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-notifications',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--enable-automation',
        '--password-store=basic',
        '--use-mock-keychain',
        '--disable-features=IsolateOrigins,site-per-process', // Disable site isolation for faster startup
      ],
      // Reduce timeout for browser launch
      timeout: 30000, // 30 seconds instead of default 60
    },
  },
  
  // Global test timeout - 5 minutes per test
  timeout: 300000,

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

});
