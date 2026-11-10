// The offline assistant model, downloaded only if the person chooses to. This file is
// the web and Expo Go build, where no model can run; onDeviceModel.native.ts is the phone.
import type { Language } from '@tpay/shared/contracts/statuses';

export type ModelState =
  | { kind: 'unsupported'; reason: 'device' | 'memory' }
  | { kind: 'absent' }
  | { kind: 'downloading'; received: number; total: number }
  | { kind: 'ready' }
  | { kind: 'failed'; reason: 'space' | 'network' | 'damaged' };

export interface OnDeviceModel {
  /** Download size in bytes, shown before anyone agrees to it. */
  readonly bytes: number;
  state(): ModelState;
  refresh(): Promise<ModelState>;
  subscribe(listener: (state: ModelState) => void): () => void;
  download(): Promise<void>;
  cancel(): Promise<void>;
  remove(): Promise<void>;
  /** The model's raw answer. checkModelProposal decides what, if anything, it is worth. */
  propose(text: string, language: Language): Promise<unknown>;
}

export const MODEL_BYTES = 491_400_032;

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
    propose: async () => { throw new Error('No on-device model on this platform'); },
  };
}
