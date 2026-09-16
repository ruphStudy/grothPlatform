export function validateProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const required = ['MONGODB_URI', 'JWT_SECRET'];
  if ((process.env.AI_PROVIDER || 'openai') === 'openai') required.push('OPENAI_API_KEY');
  if (process.env.PAYMENT_PROVIDER === 'stripe') required.push('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET');
  if ((process.env.STORAGE_PROVIDER || 's3') === 's3') {
    required.push('STORAGE_BUCKET', 'STORAGE_REGION', 'STORAGE_ACCESS_KEY_ID', 'STORAGE_SECRET_ACCESS_KEY');
  }
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required production configuration: ${key}`);
  }
}
