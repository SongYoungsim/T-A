declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    HR_SETUP_SECRET?: string;
    APP_ENV?: 'development' | 'production';
    NODE_ENV?: string;
  }
}