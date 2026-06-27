/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_APPCHECK_RECAPTCHA_SITE_KEY?: string;
  readonly VITE_STRAVA_CLIENT_ID: string;
  readonly VITE_STRAVA_REDIRECT_URI: string;
  readonly VITE_SEGMENT_TILES_BASE: string;
  readonly VITE_HEATMAP_BASE: string;
  readonly VITE_ORIDER_PERSONAL_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
