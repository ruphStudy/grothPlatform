export function validateProductionEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const required = ['MONGODB_URI', 'JWT_SECRET'];
  if ((process.env.AI_PROVIDER || 'openai') === 'openai') required.push('OPENAI_API_KEY');
  if (process.env.PAYMENT_PROVIDER === 'stripe') required.push('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET');
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required production configuration: ${key}`);
  }
}
