function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Confira o seu .env (use .env.example como referência).`,
    );
  }
  return value;
}

export const env = {
  igAppId: () => required('IG_APP_ID'),
  igAppSecret: () => required('IG_APP_SECRET'),
  verifyToken: () => required('VERIFY_TOKEN'),
  accessToken: () => process.env.ACCESS_TOKEN ?? '',
  databaseUrl: () => required('DATABASE_URL'),
  panelPassword: () => required('PANEL_PASSWORD'),
};
