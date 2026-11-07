import { Router, type RequestHandler } from 'express';
import type { DeviceController } from '../controllers/DeviceController';
import type { ProfileController } from '../controllers/ProfileController';





export function createDeviceRouter(
  devices: DeviceController,
  profiles: ProfileController,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  router.post('/devices/register', devices.register);
  router.get('/profile', authenticate, profiles.get);
  router.patch('/profile', authenticate, profiles.update);

  return router;
}