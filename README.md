# Employee Camera Hours Dashboard

A secure, real-time dashboard for automated testing of Employee Camera Hours applications using Playwright automation. The dashboard allows you to select multiple clients, configure test parameters, and execute automated tests with real-time console output streaming.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
npx playwright install
```

This installs:
- **Express** - Web server for API endpoints
- **CORS** - Cross-origin resource sharing
- **mssql** - SQL Server database connection
- **Playwright** - Browser automation framework
- **@playwright/test** - Playwright test runner

### 2. Fetch Database Data (Optional)
```bash
npm run test-db
```

This script:
- Connects to the SQL Server database
- Fetches client data including `applandingurl`, `username`, and `password`
- Updates `index.html` with the latest client information
- **Note**: If database connection fails, you can manually update credentials in `index.html`

### 3. Start the Server
```bash
npm start
```

Or directly:
```bash
node playwright-server.js
```

Or using PowerShell script:
```powershell
.\start-server.ps1
```

The server will start on **port 3010** by default (configurable via `PORT` environment variable).

### 4. Restart the Server

After making changes to server code or configuration files, you need to restart the server for changes to take effect.

#### Windows (PowerShell)
```powershell
# Find the process using port 3010
netstat -ano | findstr "LISTENING" | findstr ":3010"

# Kill the process (replace <PID> with the actual process ID from above)
taskkill /PID <PID> /F

# Start the server again
npm start
```

Or use the PowerShell script:
```powershell
.\start-server.ps1
```

#### Quick Restart (Windows PowerShell)
```powershell
# One-liner to kill and restart
$port = netstat -ano | findstr "LISTENING" | findstr ":3010" | ForEach-Object { ($_ -split '\s+')[-1] }; if ($port) { taskkill /PID $port /F }; Start-Sleep -Seconds 2; npm start
```

#### Using Batch File
```batch
start.bat
```

**Note**: After modifying:
- `playwright-server.js` - Restart required
- `playwright.config.js` - Restart required
- `playwright-tests.spec.js` - Restart required
- `queries/ECH_query.sql` - Restart required
- Any other server-side files - Restart required

### 5. Open Dashboard
Open `index.html` in your browser (or navigate to `http://localhost:3010` if using the server).

## 📋 Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run test-db` | `node test-db.js` | Fetch client data from database and update `index.html` |
| `npm start` | `node launch.js` | Start the Playwright test server |
| `npm run server` | `node playwright-server.js` | Start server directly |
| `npm run playwright-test` | `npx playwright test` | Run Playwright tests directly (without dashboard) |
| `npm run dev` | `node launch.js` | Development mode (same as start) |

## 🎯 How It Works

### Architecture Overview

```
┌─────────────────┐
│   index.html    │  ← Frontend Dashboard (HTML/CSS/JS)
│   (Browser)     │
└────────┬────────┘
         │ HTTP POST /run-tests
         │ Server-Sent Events /events
         ▼
┌─────────────────┐
│ playwright-      │  ← Express Server (Node.js)
│ server.js        │
└────────┬────────┘
         │ Spawns child process
         │ Sets SELECTED_CLIENTS env var
         ▼
┌─────────────────┐
│ playwright-      │  ← Playwright Test Runner
│ tests.spec.js   │
└────────┬────────┘
         │ Navigates & Tests
         ▼
┌─────────────────┐
│ Client Apps     │  ← Target Applications
│ (applandingurl) │
└─────────────────┘
```

### Test Execution Flow

1. **User selects clients** from the dropdown in the dashboard
2. **User clicks "Generate Report"** button
3. **Frontend sends POST request** to `http://localhost:3010/run-tests` with selected client data
4. **Server validates** client data (checks for `applandingurl`)
5. **Server spawns Playwright** process with `SELECTED_CLIENTS` environment variable
6. **Playwright tests execute** for each selected client:
   - Navigate to `applandingurl`
   - Check page load
   - Attempt login with `username` and `password` from database
   - Take screenshots
   - Collect performance metrics
7. **Real-time logs stream** back to frontend via Server-Sent Events
8. **Results displayed** in the console output area

### Multi-Client Testing

- **Sequential Execution**: Tests run one client at a time (not parallel)
- **Individual Tests**: Each client gets its own test case in Playwright
- **Delay Between Clients**: 2-second delay between client tests
- **Error Isolation**: If one client fails, others continue testing

## 📊 Dashboard Features

### Client Selection
- **Multi-select dropdown** with search functionality
- **Select All / Clear All** buttons
- **Client data includes**:
  - `id` - Client ID
  - `name` - Client name
  - `applandingurl` - Application landing URL
  - `username` - Login username (from database)
  - `password` - Login password (from database)
  - `dbname` - Database name
  - `liveserverip` - Live server IP

### Report Configuration
- **Report Type**: Dropdown selection (e.g., "Summary", "Detailed")
- **Report Name**: Dropdown selection (e.g., "Employee Camera Hours")
- **Start Date**: Custom calendar (defaults to today - 2 days)
- **End Date**: Custom calendar (defaults to today - 2 days)
- **Date Restrictions**: Future dates are disabled

### Test Execution
- **Generate Report Button**: Triggers Playwright automation
- **Real-time Console**: Live streaming of test output
- **Progress Tracking**: Shows which client is being tested
- **Error Handling**: Screenshots saved on failure
- **Test Results**: Summary displayed after completion

## 🔒 Security Features

- **Token Authentication**: Set `RUN_TOKEN` environment variable for production
- **Concurrency Protection**: Prevents multiple simultaneous test runs
- **Real-time Streaming**: Server-Sent Events for live test output
- **Error Boundaries**: Proper error handling and cleanup
- **Input Validation**: Validates client data before execution

### Production Security Setup

```bash
# Set token for production
export RUN_TOKEN=your-secret-token

# Start server
npm start
```

Then uncomment the token header in `script.js`:
```javascript
headers: {
  'Content-Type': 'application/json',
  'x-run-token': 'your-secret-token'  // Uncomment this line
}
```

## 🗄️ Database Configuration

### Database Connection

The `test-db.js` script connects to:
- **Server**: `STAGING-LIVE\DBSRV_QA` (or `74.214.18.48`)
- **Database**: `master`
- **User**: `msdeveloper`
- **Password**: `Lkjh123`

### SQL Query

The script executes `queries/client-data/get-clients-original.sql` which:
- Fetches company details
- Retrieves credentials (`userid` → `username`, `passwords` → `password`)
- Gets application landing URLs
- Returns structured client data

### Data Structure

Each client object contains:
```javascript
{
  id: "213",
  name: "Arch Telecom",
  dbname: "ArchTelecom",
  landingurl: "https://archtelecom.rebiz.com/",
  liveserverip: "74.214.18.48",
  applicationname: "Employee Camera Hours",
  applandingurl: "https://archtelecom.rebiz.com/EmployeeCameraHours",
  username: "superadmin",
  password: "admin123"
}
```

## 🧪 Playwright Test Details

### Test Configuration

- **Browser**: Chromium only (Firefox and WebKit removed)
- **Mode**: Headful (visible browser window)
- **Timeout**: 30 seconds per test
- **Reporter**: List reporter (console output)

### Test Steps Per Client

1. **Navigation**: Navigate to `applandingurl` with `networkidle` wait
2. **Page Load Check**: Verify page title and load status
3. **Login Attempt**: 
   - Find username/password fields
   - Fill credentials if available
   - Click submit button
   - Wait for login response
4. **Screenshot**: Capture full-page screenshot
5. **Navigation Elements**: Count nav elements and links
6. **Performance Metrics**: Measure page load time

### Test Output

- **Console Logs**: Detailed logging for each step
- **Screenshots**: Saved to `screenshots/` directory
- **Test Results**: Saved to `test-results/` directory
- **Videos**: Recorded for failed tests

## 📁 Project Structure

```
Employee camera Web/
├── index.html                 # Main dashboard HTML
├── script.js                  # Frontend JavaScript
├── styles.css                 # Dashboard styling (includes layout/z-index fixes)
├── playwright-server.js       # Express server
├── playwright-tests.spec.js   # Playwright tests
├── playwright.config.js
├── execute-ech-query-helper.js
├── db-utils.js
├── db-config.json             # DB connection settings
├── test-db.js                 # Fetch clients into clients-data-manual.json
├── package.json
├── queries/
│   ├── ECH_query.sql          # Employee camera hours query for comparisons
│   └── client-data/
│       └── get-clients-original.sql
├── logs/                      # Created at runtime: json/db, json/portal, comparison, metadata
├── screenshots/
├── test-results/
└── README.md
```

## 🐛 Troubleshooting

### Database Connection Issues

**Problem**: `test-db.js` hangs or fails to connect

**Solutions**:
1. Check VPN connection (if required)
2. Verify database server is accessible: `ping STAGING-LIVE`
3. Test connection manually with SQL Server Management Studio
4. Update credentials in `test-db.js` if changed
5. Manually update `index.html` with client data if needed

### Server Not Starting

**Problem**: `npm start` fails or server doesn't respond

**Solutions**:
1. Check if port 3010 is already in use: `netstat -ano | findstr ":3010"`
2. Kill any existing process on port 3010:
   ```powershell
   # Find process ID
   netstat -ano | findstr "LISTENING" | findstr ":3010"
   # Kill process (replace <PID> with actual ID)
   taskkill /PID <PID> /F
   ```
3. Install dependencies: `npm install`
4. Check for errors in terminal output
5. Try running directly: `node playwright-server.js`
6. Check if `test-db.js` file exists (required for server startup)

### Server Restart Required

**Problem**: Changes to code not taking effect

**Solutions**:
1. Always restart the server after modifying:
   - Server files (`playwright-server.js`)
   - Configuration files (`playwright.config.js`)
   - Test files (`playwright-tests.spec.js`)
   - SQL queries (`queries/ECH_query.sql`)
2. Use restart commands (see "Restart the Server" section above)
3. Verify server restarted by checking port 3010 is listening:
   ```powershell
   netstat -ano | findstr "LISTENING" | findstr ":3010"
   ```

### Tests Not Running

**Problem**: Clicking "Generate Report" doesn't trigger tests

**Solutions**:
1. Verify server is running on port 3010
2. Check browser console for errors
3. Ensure at least one client is selected
4. Verify selected clients have valid `applandingurl`
5. Check `SELECTED_CLIENTS` environment variable is being set

### Login Failures

**Problem**: Tests fail with "loginClicked is not defined" or login not working

**Solutions**:
1. Verify `username` and `password` are in client data
2. Check if login form elements exist on the page
3. Review screenshots in `screenshots/` directory
4. Update test selectors in `playwright-tests.spec.js` if needed

### No Console Output

**Problem**: Real-time console output not showing

**Solutions**:
1. Check Server-Sent Events connection in browser DevTools
2. Verify `/events` endpoint is accessible
3. Check server logs for errors
4. Refresh the page and try again

## 🔧 Configuration

### Environment Variables

- `PORT` - Server port (default: 3010)
- `RUN_TOKEN` - Authentication token for production
- `SELECTED_CLIENTS` - JSON string of selected clients (set by server)

### Playwright Configuration

Edit `playwright.config.js` to:
- Change browser (currently Chromium only)
- Adjust timeouts
- Modify reporter settings
- Configure test directory

### Database Configuration

Edit `test-db.js` to:
- Change database server
- Update credentials
- Modify SQL query
- Change output format

## 📝 Development Notes

### Adding New Test Steps

Edit `playwright-tests.spec.js` in the `testClientApplication` function:

```javascript
// Add new test step
await page.click('button.new-feature');
await page.waitForTimeout(1000);
```

### Modifying Client Data Structure

1. Update SQL query in `queries/client-data/get-clients-original.sql`
2. Update mapping in `test-db.js`
3. Update frontend code in `script.js` if needed

### Customizing Dashboard UI

- **Styles**: Edit `styles.css`
- **Layout**: Edit `index.html`
- **Functionality**: Edit `script.js`

## 📊 Features Checklist

- ✅ Real-time test execution
- ✅ Live console output streaming via SSE
- ✅ Dark/Light theme toggle
- ✅ Custom calendar for date selection
- ✅ Future dates disabled
- ✅ Default dates (today - 2 days)
- ✅ Multi-client selection and testing
- ✅ Sequential testing of multiple clients
- ✅ Individual test cases per client
- ✅ Automatic login with database credentials
- ✅ Progress tracking for each client
- ✅ Error handling and fallbacks
- ✅ Screenshots for each client test
- ✅ Performance metrics collection
- ✅ Custom dropdowns with hover effects
- ✅ Server-Sent Events for real-time updates

## 🚨 Known Issues

1. **Database Connection**: May hang if VPN is not connected or server is unreachable
2. **Test Timeout**: Some slow-loading pages may exceed 30-second timeout
3. **Login Form Detection**: May not detect all login form variations
4. **Multiple Test Runs**: Server prevents concurrent runs (by design)

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review browser console for errors
3. Check server terminal output
4. Review test results in `test-results/` directory
5. Check screenshots in `screenshots/` directory

## 📄 License

This project is for internal use only.

---

**Last Updated**: October 2025
**Version**: 1.0.0
