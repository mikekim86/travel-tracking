import type { Notifier } from './types.ts';

export class ConsoleNotifier implements Notifier {
  async send(message: string): Promise<void> {
    console.log(`[whatsapp] ${message}`);
  }
}

export class MetaWhatsAppClient {
  private readonly phoneNumberId: string;
  private readonly accessToken: string;
  private readonly apiVersion: string;

  constructor(phoneNumberId: string, accessToken: string, apiVersion = 'v20.0') {
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
    this.apiVersion = apiVersion;
  }

  async sendTo(recipient: string, message: string): Promise<void> {
    const url = `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: recipient,
        type: 'text',
        text: { body: message },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`WhatsApp API error: ${response.status} ${body}`);
    }
  }
}

export class ContactAwareWhatsAppNotifier implements Notifier {
  private readonly client: MetaWhatsAppClient;
  private readonly getRecipients: () => Promise<string[]>;
  private readonly fallbackRecipient?: string;

  constructor(
    client: MetaWhatsAppClient,
    getRecipients: () => Promise<string[]>,
    fallbackRecipient?: string,
  ) {
    this.client = client;
    this.getRecipients = getRecipients;
    this.fallbackRecipient = fallbackRecipient;
  }

  async send(message: string): Promise<void> {
    const recipients = [...new Set((await this.getRecipients()).filter(Boolean))];
    if (recipients.length === 0 && this.fallbackRecipient) {
      recipients.push(this.fallbackRecipient);
    }
    if (recipients.length === 0) {
      throw new Error('No WhatsApp recipients configured');
    }

    for (const recipient of recipients) {
      await this.client.sendTo(recipient, message);
    }
  }
}
