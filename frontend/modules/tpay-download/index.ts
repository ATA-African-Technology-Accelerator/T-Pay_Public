import { requireOptionalNativeModule } from 'expo';

export type DownloadStatus = {
  state: 'pending' | 'running' | 'paused' | 'done' | 'failed' | 'missing';
  received: number;
  /** -1 until the server has said how big the file is. */
  total: number;
};

interface TpayDownloadNative {
  /**
   * Hands a download to Android's DownloadManager, which keeps going when the app is in the
   * background or closed, and resumes by itself after a dropped connection. Returns its id.
   */
  start(url: string, fileName: string, title: string): Promise<number>;
  status(id: number): Promise<DownloadStatus>;
  /** Stops it and deletes what was downloaded. */
  cancel(id: number): Promise<void>;
  /** Moves the finished file into the app's private storage, at an absolute path. */
  moveTo(id: number, fileName: string, destination: string): Promise<boolean>;
}

/** Null in Expo Go, on web and on iOS, where this module isn't built. */
export const TpayDownload = requireOptionalNativeModule<TpayDownloadNative>('TpayDownload');
