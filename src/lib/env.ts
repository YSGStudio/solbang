function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/** Safe in the browser. Inlined by Next at build time. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  kakaoJavaScriptKey: process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY ?? "",
};

/** Server only. Reading any of these from a client component throws at build. */
export const serverEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get serviceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get kakaoRestApiKey() {
    return required("KAKAO_REST_API_KEY");
  },
  /**
   * Origin sent in the Kakao `KA` header. Kakao rejects the call unless this
   * exact value is registered as a Web platform domain in the developer
   * console, so it has to follow the deployment rather than be hardcoded.
   */
  get kakaoOrigin() {
    return process.env.KAKAO_ORIGIN ?? "http://localhost:3000";
  },
};
