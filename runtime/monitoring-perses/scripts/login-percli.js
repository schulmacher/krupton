import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const PERSES_URL = 'http://localhost:8080';
const MAX_RETRIES = 10;
const RETRY_DELAY = 1000; // 1 second

async function waitForPerses() {
  console.log('Waiting for Perses to be ready...');
  
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      // Just check if Perses responds at all (even 404 is fine)
      const response = await fetch(`${PERSES_URL}/api/v1/projects`);
      if (response.status < 500) {
        console.log('Perses is ready!');
        return true;
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      // Perses not ready yet
    }
    
    await setTimeout(RETRY_DELAY);
    console.log(`Retry ${i + 1}/${MAX_RETRIES}...`);
  }
  
  throw new Error('Perses did not become ready in time');
}

async function loginPercli() {
  return new Promise((resolve, reject) => {
    const percli = spawn('./bin/percli', ['login', PERSES_URL], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    percli.on('close', (code) => {
      if (code === 0) {
        console.log('Successfully logged in to Perses');
        resolve();
      } else {
        reject(new Error(`percli login failed with code ${code}`));
      }
    });

    percli.on('error', (error) => {
      reject(error);
    });
  });
}

async function main() {
  try {
    await waitForPerses();
    await loginPercli();
    console.log('Perses setup complete!');
  } catch (error) {
    console.error('Error during Perses login:', error.message);
    process.exit(1);
  }
}

main();

