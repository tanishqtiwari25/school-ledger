declare namespace Cloudflare {
  interface Env {
    AUTH_PROVIDER?: string;
    ACCESS_TEAM_URL?: string;
    ACCESS_AUD?: string;
    BOOTSTRAP_ADMIN_EMAIL?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
