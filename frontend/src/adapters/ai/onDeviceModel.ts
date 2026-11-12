// The offline assistant model, downloaded only if the person chooses to. This file is
// the web and Expo Go build, where no model can run; onDeviceModel.native.ts is the phone.
import { MODEL_BYTES, type ModelState, type OnDeviceModel } from './onDeviceModel.types';

export type { ModelState, OnDeviceModel } from './onDeviceModel.types';

export function loadOnDeviceModel(): OnDeviceModel {
  const state: ModelState = { kind: 'unsupported', reason: 'device' };
  return {
    bytes: MODEL_BYTES,
    state: () => state,
    refresh: async () => state,
    subscribe: () => () => undefined,
    download: async () => undefined,
    cancel: async () => undefined,
    remove: async () => undefined,
    warmUp: async () => undefined,
    propose: async () => { throw new Error('No on-device model on this platform'); },
  };
}
