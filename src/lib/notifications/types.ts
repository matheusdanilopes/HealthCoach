export type NotificationCategory = 'imports' | 'processing' | 'updates';

export interface PushPayload {
  title: string;
  body: string;
  category: NotificationCategory;
  url?: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string;
}

export interface NotificationPreferences {
  enabled: boolean;
  imports: boolean;
  processing: boolean;
  updates: boolean;
}
