export interface IClock {
  now(): Date;
}

export interface IRandom {
  uuid(): string;
  nonce(): string;
}