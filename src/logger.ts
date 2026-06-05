import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

let logFilePath = process.env.LOG_FILE ?? './data/app.log';

function serializeDetails(details: Record<string, unknown> | undefined): string {
  if (!details) {
    return '';
  }
  try {
    return ` ${JSON.stringify(details)}`;
  } catch {
    return ` ${String(details)}`;
  }
}

export function setLogFilePath(filePath: string): void {
  logFilePath = filePath;
}

export function log(scope: string, message: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  const line = `${timestamp} [${scope}] ${message}${serializeDetails(details)}`;
  console.log(line);
  if (process.execArgv.includes('--test')) {
    return;
  }
  void mkdir(dirname(logFilePath), { recursive: true })
    .then(() => appendFile(logFilePath, `${line}\n`, 'utf8'))
    .catch(() => undefined);
}

export async function readRecentLogs(limit = 200): Promise<string[]> {
  try {
    const content = await readFile(logFilePath, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.slice(-limit);
  } catch {
    return [];
  }
}
