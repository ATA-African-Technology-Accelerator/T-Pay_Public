export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface ISigner {
  generateKeyPair(): Promise<KeyPair>;
  sign(signingInput: string, privateKey: string): Promise<string>;
  verify(signingInput: string, signature: string, publicKey: string): Promise<boolean>;
  hash(value: string): Promise<string>;
}

export interface IKeyStore {
  loadPrivateKey(): Promise<string | null>;
  savePrivateKey(privateKey: string): Promise<void>;
  deletePrivateKey(): Promise<void>;
}