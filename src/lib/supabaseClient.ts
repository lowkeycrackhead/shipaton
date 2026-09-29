import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const defaultUrl = 'https://vdcjpscmfoyqsrmtxhla.supabase.co';
const defaultKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkY2pwc2NtZm95cXNybXR4aGxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2OTI3ODYsImV4cCI6MjEwNjI2ODc4Nn0.NAqTavTpk9zMr41QPPRFD5PcU5BIETX6jmxFIVsUuKc';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || defaultUrl;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY || defaultKey;

const supabaseUrl = typeof rawUrl === 'string' ? rawUrl.trim() : defaultUrl;
const supabaseAnonKey = typeof rawKey === 'string' ? rawKey.trim() : defaultKey;

const checkConfigured = (url?: string, key?: string): boolean => {
  if (!url || !key) return false;
  if (url.includes('placeholder') || key.includes('placeholder')) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol.startsWith('http') && parsed.hostname.includes('.');
  } catch {
    return false;
  }
};

export const isSupabaseConfigured = checkConfigured(supabaseUrl, supabaseAnonKey);

export function formatAuthErrorMessage(error: unknown): string {
  const msg = (error as { message?: string })?.message || String(error || '');
  const lower = msg.toLowerCase();
  if (lower.includes('failed to fetch')) {
    return 'Could not connect to Supabase (Failed to fetch). If you have Brave Shields, uBlock, AdGuard, or an ad blocker enabled, please turn off shields for localhost, or check your internet connection.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Your email has not been confirmed yet. Please check your inbox for the confirmation link, or disable "Confirm email" in your Supabase Auth dashboard for instant logins.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'Invalid email or password. Please verify your credentials or create a new account.';
  }
  if (lower.includes('email_address_invalid') || lower.includes('invalid email')) {
    return 'Please enter a valid, active email address (e.g. @gmail.com).';
  }
  return msg || 'An unexpected authentication error occurred.';
}

/**
 * Lightweight mock client that guarantees zero crashes and full offline / GitHub review support
 * when Supabase keys are not provided.
 */
function createMockClient(): SupabaseClient {
  return {
    auth: {
      async getSession() {
        const saved = localStorage.getItem('haven_mock_session');
        if (saved) {
          try {
            return { data: { session: JSON.parse(saved) }, error: null };
          } catch {
            // ignore malformed stored session
          }
        }
        return { data: { session: null }, error: null };
      },
      async getUser() {
        const saved = localStorage.getItem('haven_mock_session');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            return { data: { user: parsed.user }, error: null };
          } catch {
            // ignore malformed stored user
          }
        }
        return { data: { user: null }, error: null };
      },
      onAuthStateChange(callback: (event: string, session: unknown) => void) {
        const handler = (e: StorageEvent) => {
          if (e.key === 'haven_mock_session') {
            const sess = e.newValue ? JSON.parse(e.newValue) : null;
            callback('SIGNED_IN', sess);
          }
        };
        window.addEventListener('storage', handler);
        return {
          data: {
            subscription: {
              unsubscribe: () => window.removeEventListener('storage', handler),
            },
          },
        };
      },
      async signInWithPassword({ email }: { email?: string; password?: string }) {
        const username = email?.split('@')[0] || email || 'Elena';
        const mockUser = {
          id: 'demo-user-123',
          email,
          user_metadata: { full_name: username },
        };
        const mockSession = {
          access_token: 'mock-token',
          user: mockUser,
        };
        localStorage.setItem('haven_mock_session', JSON.stringify(mockSession));
        return { data: { user: mockUser, session: mockSession }, error: null };
      },
      async signUp({ email, options }: { email?: string; password?: string; options?: { data?: { full_name?: string } } }) {
        const fullName = options?.data?.full_name || email?.split('@')[0] || 'Elena';
        const mockUser = {
          id: 'demo-user-123',
          email,
          user_metadata: { full_name: fullName },
        };
        const mockSession = {
          access_token: 'mock-token',
          user: mockUser,
        };
        localStorage.setItem('haven_mock_session', JSON.stringify(mockSession));
        return { data: { user: mockUser, session: mockSession }, error: null };
      },
      async signOut() {
        localStorage.removeItem('haven_mock_session');
        return { error: null };
      },
    },
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        insert: () => chain,
        update: () => chain,
        delete: () => chain,
        eq: () => chain,
        order: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: null, error: null }),
        then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

let activeClient: SupabaseClient;

if (isSupabaseConfigured) {
  try {
    activeClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    console.warn('Error creating Supabase client, falling back to mock client:', err);
    activeClient = createMockClient();
  }
} else {
  console.info('No Supabase credentials detected. Running Haven in resilient Offline/Demo mode.');
  activeClient = createMockClient();
}

export const supabase = activeClient;