import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AppModule } from '../app.module';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const connection = app.get<Connection>(getConnectionToken());
  for (const modelName of connection.modelNames()) {
    await connection.model(modelName).createIndexes();
    console.log(JSON.stringify({ level: 'info', message: 'indexes_created_or_verified', modelName }));
  }
  await app.close();
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'error', message: 'index_create_failed', error: err?.message || String(err) }));
  process.exit(1);
});
