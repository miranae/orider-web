import { clearEmulatorData } from './fixtures/seed';
import { clearAuthEmulator } from './fixtures/auth';

async function globalTeardown() {
  await clearEmulatorData();
  await clearAuthEmulator();
}

export default globalTeardown;
