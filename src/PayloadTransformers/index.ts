import { WAMessage, WASocket, proto } from '@whiskeysockets/baileys';
import { ContactPayload, MessageReceived } from 'kozz-types';
import context from 'src/Context';
import { getMessage } from 'src/Store/MessageStore';
import { downloadMediaFromMessage } from 'src/util/media';
import { clearContact, getMyContactFromCredentials } from 'src/util/utility';

export const stringifyMessageId = (messageKey: proto.IMessageKey): string => {
	const { fromMe, remoteJid, id, participant } = messageKey;
	if (participant) {
		return `${remoteJid}_${id}_${participant}`;
	} else {
		return `${remoteJid}_${id}`;
	}
};

export const serializeMessageId = (messageId: string): proto.IMessageKey => {
	const [remoteJid, id, participant] = messageId.split('_');
	return {
		id,
		participant,
		remoteJid,
	};
};

export const createContactPayload = async (
	message: WAMessage
): Promise<ContactPayload> => {
	const getContactId = (message: WAMessage) => {
		if(message.key.fromMe){
			return getMyContactFromCredentials().id;
		}
		return message.key.participant || message.participant || message.key.remoteJid!;
	};
	
	const contactId = clearContact(getContactId(message));
	return {
		hostAdded: false,
		id: contactId,
		isHostAccount: !!message.key.fromMe,
		isBlocked: context.get('blockedList').includes(message.key.participant!),
		publicName: message.pushName || '',
		isGroup: message.key.participant ? true : false,
		privateName: '',
	};
};

export const createMessagePayload = async (
	message: WAMessage,
	waSocket: WASocket
): Promise<MessageReceived> => {
	const media = await downloadMediaFromMessage(message, waSocket);
	const contact = await createContactPayload(message);

	const messageBody =
		message.message?.conversation ||
		message.message?.extendedTextMessage?.text ||
		message?.message?.imageMessage?.caption ||
		message?.message?.videoMessage?.caption ||
		'';

	const messageType = message.message?.extendedTextMessage
		? 'TEXT'
		: message.message?.audioMessage
		? 'AUDIO'
		: message.message?.stickerMessage
		? 'STICKER'
		: message.message?.videoMessage
		? 'VIDEO'
		: message.message?.imageMessage
		? 'IMAGE'
		: 'TEXT';

	const contextInfo = (
		message.message?.extendedTextMessage ||
		message.message?.audioMessage ||
		message.message?.stickerMessage ||
		message.message?.videoMessage ||
		message.message?.imageMessage
	)?.contextInfo!;

	const id = message.key.id!;
	const quotedMessageId = contextInfo?.stanzaId!;

	const quotedMessage = quotedMessageId
		? await getMessage(quotedMessageId)
		: undefined;

	if (messageBody.toLowerCase() === 'teste') {
		console.log({ id, quotedMessageId, quotedMessage });
	}

	return {
		body: messageBody,
		boundaryName: process.env.BOUNDARY_NAME ?? '',
		id,
		contact: await createContactPayload(message),
		from: contact.id,
		fromHostAccount: contact.isHostAccount,
		isViewOnce: false,
		to: message.key.remoteJid!,
		messageType: messageType,
		platform: 'Baileys',
		quotedMessage: quotedMessage || undefined,
		santizedBody: messageBody
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[\u0300-\u036f]/g, ''),
		taggedContacts: [],
		timestamp: new Date().getTime(),
		taggedConctactFriendlyBody: messageBody,
		media,
	};
};
