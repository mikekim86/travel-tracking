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

export function log(scope: string, message: string, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} [${scope}] ${message}${serializeDetails(details)}`);
}

