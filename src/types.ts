export type TargetType = 'hotel' | 'airline';

export type TargetStatus = 'active' | 'paused';

export type ScanOutcome = 'matched' | 'no_match' | 'error';

export type DatePreference =
  | {
      kind: 'exact';
      dates: string[];
    }
  | {
      kind: 'month';
      year: number;
      month: number;
    }
  | {
      kind: 'range';
      startDate: string;
      endDate: string;
    };

export interface RouteSpec {
  origin: string;
  destination: string;
}

export interface TargetBase {
  id: string;
  type: TargetType;
  providerId: string;
  name: string;
  status: TargetStatus;
  datePreference: DatePreference;
  createdAt: string;
  updatedAt: string;
  lastScannedAt?: string;
  lastScanOutcome?: ScanOutcome;
  lastScanError?: string;
  lastMatchAt?: string;
  alertedFingerprints: string[];
}

export interface HotelTarget extends TargetBase {
  type: 'hotel';
  hotelName: string;
  maxPoints: number;
  publicSearchUrl?: string;
}

export interface AirlineTarget extends TargetBase {
  type: 'airline';
  airline: string;
  route: RouteSpec;
  cabinClass: string;
}

export type Target = HotelTarget | AirlineTarget;

export interface ProviderQuery {
  target: Target;
  candidateDates: string[];
}

export interface ProviderResultBase {
  providerId: string;
  kind: TargetType;
  date: string;
  points: number;
  available: boolean;
  title: string;
  externalId?: string;
  details?: string;
  raw?: Record<string, unknown>;
}

export interface HotelProviderResult extends ProviderResultBase {
  kind: 'hotel';
  hotelName: string;
}

export interface AirlineProviderResult extends ProviderResultBase {
  kind: 'airline';
  airline: string;
  route: RouteSpec;
  cabinClass: string;
}

export type ProviderResult = HotelProviderResult | AirlineProviderResult;

export interface ProviderAdapter {
  id: string;
  search(query: ProviderQuery): Promise<ProviderResult[]>;
}

export interface MatchRecord {
  targetId: string;
  providerId: string;
  fingerprint: string;
  title: string;
  date: string;
  points: number;
  details: string;
  createdAt: string;
}

export interface ScanRecord {
  id: string;
  targetId?: string;
  startedAt: string;
  finishedAt?: string;
  outcome: ScanOutcome;
  matches: MatchRecord[];
  error?: string;
}

export interface AppState {
  targets: Target[];
  scans: ScanRecord[];
  contacts: WhatsAppContact[];
}

export interface WhatsAppContact {
  id: string;
  name: string;
  phoneNumber: string;
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
}

export interface Notifier {
  send(message: string): Promise<void>;
}

export interface ScanSummary {
  targetId: string;
  outcome: ScanOutcome;
  matches: MatchRecord[];
  error?: string;
}
