import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Formatting helpers
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

const log = {
  info: (msg) => console.log(`${COLORS.cyan}[i] ${msg}${COLORS.reset}`),
  success: (msg) => console.log(`${COLORS.green}[✓] ${msg}${COLORS.reset}`),
  warn: (msg) => console.log(`${COLORS.yellow}[!] ${msg}${COLORS.reset}`),
  error: (msg) => console.error(`${COLORS.red}[✗] ${msg}${COLORS.reset}`),
  header: (msg) => console.log(`\n${COLORS.bright}${COLORS.magenta}=== ${msg} ===${COLORS.reset}\n`)
};

log.header("AutoBell Session-Scoped Deployment Agent");

// 1. Locate and parse env file
const envPath = path.resolve(__dirname, 'web-dashboard/.env.local');
log.info(`Loading environment variables from: ${envPath}`);

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const firstEquals = line.indexOf('=');
    if (firstEquals === -1) return;
    const key = line.slice(0, firstEquals).trim();
    let val = line.slice(firstEquals + 1).trim();
    // Strip quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  });
  log.success("Loaded local .env.local file.");
  if (process.env.DATABASE_URL && !process.env.SUPABASE_DB_PASSWORD) {
    try {
      const parsedUrl = new URL(process.env.DATABASE_URL);
      if (parsedUrl.password) {
        process.env.SUPABASE_DB_PASSWORD = decodeURIComponent(parsedUrl.password);
        log.success("Extracted SUPABASE_DB_PASSWORD from DATABASE_URL.");
      }
    } catch (e) {
      log.warn("Could not parse password from DATABASE_URL: " + e.message);
    }
  }
} else {
  log.warn("No .env.local found in web-dashboard folder. Relying on pre-existing environment variables.");
}

// 2. Validate Credentials
const supabaseToken = process.env.SUPABASE_ACCESS_TOKEN;
let firebaseCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!supabaseToken) {
  log.error("SUPABASE_ACCESS_TOKEN is missing. Please add it to web-dashboard/.env.local");
  process.exit(1);
}

if (!firebaseCreds) {
  log.error("GOOGLE_APPLICATION_CREDENTIALS is missing. Please add it to web-dashboard/.env.local");
  process.exit(1);
}

// Resolve firebase credentials path relative to root or web-dashboard
let resolvedFirebaseCreds = firebaseCreds;
if (!path.isAbsolute(firebaseCreds)) {
  const rootPath = path.resolve(__dirname, firebaseCreds);
  const webPath = path.resolve(__dirname, 'web-dashboard', firebaseCreds);
  if (fs.existsSync(rootPath)) {
    resolvedFirebaseCreds = rootPath;
  } else if (fs.existsSync(webPath)) {
    resolvedFirebaseCreds = webPath;
  } else {
    resolvedFirebaseCreds = rootPath; // fallback
  }
}

if (!fs.existsSync(resolvedFirebaseCreds)) {
  log.error(`Firebase Service Account key file not found. Checked:\n - ${path.resolve(__dirname, firebaseCreds)}\n - ${path.resolve(__dirname, 'web-dashboard', firebaseCreds)}`);
  process.exit(1);
}

// Ensure the resolved absolute path is used in GOOGLE_APPLICATION_CREDENTIALS
process.env.GOOGLE_APPLICATION_CREDENTIALS = resolvedFirebaseCreds;

// 3. Verify .firebaserc configuration (must target 'iobell')
const firebaseRcPath = path.resolve(__dirname, 'web-dashboard/.firebaserc');
if (fs.existsSync(firebaseRcPath)) {
  try {
    const rc = JSON.parse(fs.readFileSync(firebaseRcPath, 'utf8'));
    const defaultProject = rc?.projects?.default;
    if (defaultProject !== 'iobell') {
      log.error(`CRITICAL: Firebase configuration targets '${defaultProject}' but must target 'iobell'. Deployment halted.`);
      process.exit(1);
    }
    log.success("Verified Firebase target project: 'iobell'");
  } catch (err) {
    log.warn(`Could not parse .firebaserc: ${err.message}`);
  }
} else {
  log.warn("No .firebaserc found in web-dashboard folder.");
}

const statusTable = [];

// Helper to run a command and log it
function runStep(name, cmd, args, cwd) {
  log.header(`Deploying: ${name}`);
  log.info(`Running in: ${cwd}`);
  log.info(`Command: ${cmd} ${args.join(' ')}`);

  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: true,
    cwd,
    env: process.env
  });

  if (result.status === 0) {
    log.success(`${name} completed successfully.`);
    statusTable.push({ Step: name, Status: 'SUCCESS' });
    return true;
  } else {
    log.error(`${name} failed with exit code ${result.status}.`);
    statusTable.push({ Step: name, Status: 'FAILED' });
    return false;
  }
}

// 4. Run Supabase Database Push (from Root Path)
const supabaseDbSuccess = runStep(
  "Supabase DB Migrations (supabase db push)",
  "npx",
  ["supabase", "db", "push"],
  __dirname
);

// 5. Run Supabase Functions Deploy (from Root Path)
let supabaseFuncSuccess = false;
if (supabaseDbSuccess) {
  supabaseFuncSuccess = runStep(
    "Supabase Edge Functions (supabase functions deploy)",
    "npx",
    ["supabase", "functions", "deploy"],
    __dirname
  );
} else {
  log.warn("Skipping Supabase Functions deployment because DB Migrations failed.");
  statusTable.push({ Step: "Supabase Edge Functions", Status: "SKIPPED" });
}

// 6. Build Web Dashboard (in web-dashboard directory)
const webDashboardDir = path.resolve(__dirname, 'web-dashboard');
let webBuildSuccess = false;
if (supabaseDbSuccess) {
  webBuildSuccess = runStep(
    "Build Web Dashboard (npm run build)",
    "npm",
    ["run", "build"],
    webDashboardDir
  );
} else {
  log.warn("Skipping Frontend Build because Backend deployment failed.");
  statusTable.push({ Step: "Build Web Dashboard", Status: "SKIPPED" });
}

// 7. Deploy to Firebase (in web-dashboard directory)
let firebaseSuccess = false;
if (webBuildSuccess) {
  firebaseSuccess = runStep(
    "Firebase Frontend Deployment (firebase deploy)",
    "npx",
    ["firebase", "deploy", "--only", "hosting"],
    webDashboardDir
  );
} else {
  log.warn("Skipping Firebase deployment because build failed.");
  statusTable.push({ Step: "Firebase Deployment", Status: "SKIPPED" });
}

// 8. Session-close Verification and Cleanup
log.header("Session Cleanup & Security Verification");

// Validate if any global sessions exist on disk
const globalFirebaseCheck = spawnSync("npx", ["firebase", "login:list"], { shell: true });
const globalFirebaseOutput = globalFirebaseCheck.stdout?.toString() || '';
const hasGlobalFirebase = !globalFirebaseOutput.includes("No authorized accounts");

if (hasGlobalFirebase) {
  log.warn("Detected a lingering global Firebase session on your computer.");
  log.info("Closing global session for safety...");
  spawnSync("npx", ["firebase", "logout"], { stdio: 'inherit', shell: true });
  log.success("Global Firebase session logged out.");
} else {
  log.success("No global Firebase sessions found on disk.");
}

// Print deployment summary
log.header("Deployment Summary");
console.table(statusTable);

const allSuccess = supabaseDbSuccess && supabaseFuncSuccess && webBuildSuccess && firebaseSuccess;
if (allSuccess) {
  log.success("All deployments completed successfully! Your session remains clean and secure.");
  process.exit(0);
} else {
  log.error("Some steps failed. Please review the logs above.");
  process.exit(1);
}
