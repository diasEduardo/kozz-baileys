import { WAMessage, WASocket, proto } from '@whiskeysockets/baileys';
import { ContactPayload, GroupChat, MessageReceived } from 'kozz-types';
import Context from 'src/Context';
import { getContact } from 'src/Store/ContactStore';
import { getMessage } from 'src/Store/MessageStore';
import { GroupChatModel } from 'src/Store/models';
import { downloadMediaFromMessage } from 'src/util/media';
import { clearContact, replaceTaggedName } from 'src/util/utility';

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
		if (message.key.fromMe) {
			return Context.get('hostData').id;
		}
		return message.key.participant || message.participant || message.key.remoteJid!;
	};

	const contactId = clearContact(getContactId(message));
	const isBlocked = Context.get('blockedList').includes(message.key.participant!);

	return {
		hostAdded: false,
		id: contactId,
		isHostAccount: !!message.key.fromMe,
		isBlocked,
		publicName: message.pushName || '',
		isGroup: message.key.participant ? true : false,
		privateName: '',
	};
};

export const createContactFromSync = async (contact: {
	id: string;
	name: string;
}) => {
	const hostData = Context.get('hostData');
	const isBlocked = Context.get('blockedList').includes(contact.id);

	return {
		hostAdded: false,
		id: contact.id,
		isHostAccount: hostData.id === contact.id,
		isBlocked,
		publicName: contact.name || 'no_name',
		isGroup: contact.id.includes('@g.us'),
		privateName: '',
	};
};

export const createMessagePayload = async (
	message: WAMessage,
	waSocket: WASocket
): Promise<MessageReceived> => {
	const media = await downloadMediaFromMessage(message, waSocket);
	const contact = await createContactPayload(message);
	const taggedContact = await createtTaggedContactPayload(message);

	const messageBody =
		message.message?.conversation ||
		message.message?.extendedTextMessage?.text ||
		message?.message?.imageMessage?.caption ||
		message?.message?.videoMessage?.caption ||
		'';

	let taggedConctactFriendlyBody = messageBody;
	if (taggedContact.length) {
		taggedConctactFriendlyBody = replaceTaggedName(messageBody, taggedContact);
	}
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
		taggedContacts: taggedContact,
		timestamp:
			new Date(Number(message.messageTimestamp)).getTime() || new Date().getTime(),
		taggedConctactFriendlyBody: taggedConctactFriendlyBody,
		media,
	};
};

export const createtTaggedContactPayload = async (
	message: WAMessage
): Promise<ContactPayload[]> => {
	let contacts: ContactPayload[] = [];
	if (message.message?.extendedTextMessage?.contextInfo?.mentionedJid) {
		for (const contactId of message.message?.extendedTextMessage?.contextInfo
			?.mentionedJid) {
			const contact = await getContact(contactId);
			if (contact) {
				contacts.push(contact);
			}
		}
	}

	return contacts;
};

export const createGroupChatPayload = (ogChatPayload: any): GroupChat => {
	return {
		id: ogChatPayload.id,
		community: ogChatPayload.linkedParent ?? null,
		description: ogChatPayload.desc ?? '',
		memberCount: ogChatPayload.size!,
		name: ogChatPayload.subject,
		owner:
			ogChatPayload.owner ??
			ogChatPayload.participants.find(
				(participant: any) => participant.admin === 'superadmin'
			)?.id ??
			'NOT_FOUND',
		participants: ogChatPayload.participants.map((participant: any) => ({
			admin: !!participant.admin,
			id: participant.id,
		})),
		unreadCount: ogChatPayload.unreadCount ?? 0,
	};
};
