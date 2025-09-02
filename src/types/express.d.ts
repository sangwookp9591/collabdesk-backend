import { Request } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    user: {
      sub: string;
      email?: string;
      name?: string;
      [key: string]: any;
    };
  }
}
