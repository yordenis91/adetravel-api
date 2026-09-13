export function createPrismaMock() {
  return {
    payment: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    request: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
    quotation: {
      findFirst: jest.fn(),
    },
    systemConfig: {
      findFirst: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    client: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

export function createMockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
