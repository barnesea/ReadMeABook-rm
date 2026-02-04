/**
 * Component: Credential Migration Service
 * Documentation: documentation/backend/services/config.md
 *
 * One-time migration to encrypt plaintext credentials stored in the database.
 * Runs on startup and auto-detects plaintext vs encrypted values.
 */

import { prisma } from '@/lib/db';
import { getEncryptionService } from './encryption.service';
import { RMABLogger } from '@/lib/utils/logger';

const logger = RMABLogger.create('CredentialMigration');

/**
 * Check if a value looks like it's already encrypted.
 * Encrypted values have format: base64:base64:base64 (iv:authTag:ciphertext)
 */
export function isEncryptedFormat(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const parts = value.split(':');
  if (parts.length !== 3) {
    return false;
  }

  // Check if all parts look like base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return parts.every(part => part.length > 0 && base64Regex.test(part));
}

/**
 * Migrate a single configuration key from plaintext to encrypted.
 * Returns true if migration was performed, false if already encrypted or not found.
 */
async function migrateConfigKey(key: string): Promise<boolean> {
  const config = await prisma.configuration.findUnique({
    where: { key },
  });

  if (!config || !config.value) {
    return false;
  }

  // Skip if already marked as encrypted
  if (config.encrypted) {
    logger.debug(`Key "${key}" already marked as encrypted, skipping`);
    return false;
  }

  // Skip if value looks like it's already encrypted (format check)
  if (isEncryptedFormat(config.value)) {
    logger.debug(`Key "${key}" appears to be in encrypted format, updating flag only`);
    await prisma.configuration.update({
      where: { key },
      data: { encrypted: true },
    });
    return false;
  }

  // Encrypt the plaintext value
  const encryptionService = getEncryptionService();
  const encryptedValue = encryptionService.encrypt(config.value);

  await prisma.configuration.update({
    where: { key },
    data: {
      value: encryptedValue,
      encrypted: true,
    },
  });

  logger.info(`Migrated credential: ${key}`);
  return true;
}

/**
 * Migrate download_clients JSON to encrypt passwords within.
 * Returns true if any passwords were encrypted.
 */
async function migrateDownloadClients(): Promise<boolean> {
  const config = await prisma.configuration.findUnique({
    where: { key: 'download_clients' },
  });

  if (!config || !config.value) {
    return false;
  }

  let clients: any[];
  try {
    clients = JSON.parse(config.value);
  } catch (error) {
    logger.error('Failed to parse download_clients JSON', { error });
    return false;
  }

  if (!Array.isArray(clients) || clients.length === 0) {
    return false;
  }

  const encryptionService = getEncryptionService();
  let migratedCount = 0;

  for (const client of clients) {
    // Encrypt password if present and not already encrypted
    if (client.password && typeof client.password === 'string' && !isEncryptedFormat(client.password)) {
      client.password = encryptionService.encrypt(client.password);
      migratedCount++;
    }
  }

  if (migratedCount > 0) {
    await prisma.configuration.update({
      where: { key: 'download_clients' },
      data: { value: JSON.stringify(clients) },
    });

    logger.info(`Migrated ${migratedCount} download client password(s)`);
    return true;
  }

  return false;
}

/**
 * Run the credential migration.
 * Safe to call multiple times - detects and skips already-encrypted values.
 */
export async function runCredentialMigration(): Promise<void> {
  logger.info('Starting credential migration check...');

  let totalMigrated = 0;

  // Migrate simple config keys
  const keysToMigrate = [
    'plex_token',
    'prowlarr_api_key',
  ];

  for (const key of keysToMigrate) {
    try {
      const migrated = await migrateConfigKey(key);
      if (migrated) {
        totalMigrated++;
      }
    } catch (error) {
      logger.error(`Failed to migrate ${key}`, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Migrate download client passwords
  try {
    const migratedClients = await migrateDownloadClients();
    if (migratedClients) {
      totalMigrated++;
    }
  } catch (error) {
    logger.error('Failed to migrate download client passwords', { error: error instanceof Error ? error.message : String(error) });
  }

  if (totalMigrated > 0) {
    logger.info(`Credential migration complete: ${totalMigrated} item(s) encrypted`);
  } else {
    logger.info('Credential migration complete: no changes needed');
  }
}
