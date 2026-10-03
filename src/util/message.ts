import { aesDecryptGCM, hmacSign, proto , WAMessage } from 'baileys';

export const baileysMessageTypes = [
	'videoMessage',
	'stickerMessage',
	'imageMessage',
	'audioMessage',
	'extendedTextMessage',
];


export const decryptEditedMessage = ({ encPayload, encIv }: any, { secret, id, sender }: any) => {
  const toBinary = (txt: any) => Buffer.from(txt)
  const senderBuf = toBinary(sender)
  const sign = Buffer.concat([
    toBinary(id),
    senderBuf,
    senderBuf,
    toBinary('Message Edit'),
    new Uint8Array([1])
  ])
  const key = hmacSign(secret, new Uint8Array(32))
  const decKey = hmacSign(sign, key)
  const decrypted = aesDecryptGCM(encPayload, decKey, encIv, new Uint8Array(0))
  return proto.Message.decode(decrypted)
}

export const getQuotedMessageId = (message: WAMessage) => {};
