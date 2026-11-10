import { NodeP256Signer } from '../src/adapters/crypto/NodeP256Signer';




const keys = await new NodeP256Signer().generateKeyPair();

console.log(`ROOT_PRIVATE_KEY=${keys.privateKey}`);
console.log(`ROOT_PUBLIC_KEY=${keys.publicKey}`);