import type { Language } from '@tpay/shared/contracts/statuses';

// Shared by the web stub and the phone build. Kept in its own file because
// "./onDeviceModel" resolves to onDeviceModel.native.ts on a phone, so importing
// values from it there would import the file into itself.

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
  /** Loads the model and reads its instruction in the background, so the first answer isn't the slow one. */
  warmUp(): Promise<void>;
  /** The model's raw answer. checkModelProposal decides what, if anything, it is worth. */
  propose(text: string, language: Language): Promise<unknown>;
}

export const MODEL_BYTES = 491_400_032;
