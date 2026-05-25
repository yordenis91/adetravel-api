import { prisma } from '../src/lib/prisma';

async function run() {
  try {
    const existing = await prisma.systemConfig.findFirst();
    if (!existing) {
      const created = await prisma.systemConfig.create({ data: { exchangeRates: '[]' } });
      console.log('Created config', created);
      return;
    }
    const updated = await prisma.systemConfig.update({ where: { id: existing.id }, data: { exchangeRates: '[{"fromCurrency":"USD","toCurrency":"CLP","rate":900}]' } });
    console.log('Updated config', updated);
  } catch (err) {
    console.error('Error', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
