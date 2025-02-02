import { MessageReceived } from 'kozz-types';
import Context from 'src/Context';
import { getMedia, saveMedia } from './MediaStore';
import { getContact, saveContact } from './ContactStore';
import { MessageModel } from './models';
import { proto } from '@whiskeysockets/baileys';

const database = Context.get('database');

export const saveMessage = async (
	message: MessageReceived,
	originalMessage: proto.IWebMessageInfo
): Promise<string> => {
	database.upsert('message', {
		...message,
		media: message.media ? await saveMedia(message.media) : undefined,
		contact: await saveContact(message.contact),
		timestamp: message.timestamp,
		quotedMessage: message.quotedMessage?.id,
		taggedContacts: JSON.stringify(message.taggedContacts),
		originalMessagePayload: JSON.stringify(originalMessage),
	});

	const chatId = message.from;

	const oldChatOrder = database.getById('metadata', 'default')?.chatOrder ?? [];

	database.upsert('metadata', {
		id: 'default',
		chatOrder: [chatId, ...oldChatOrder.filter(chat => chat !== chatId)],
	});

	return message.id;
};

export const getMessageOrder = () => {
	const messageOrder = database.getById('metadata', 'default')?.chatOrder;
	return messageOrder || [];
};

export const getMessage = async (
	id: string
): Promise<(MessageReceived & { originalMessagePayload: string }) | null> => {
	const message: MessageModel | null =
		((await database.getById('message', id)) as MessageModel) ?? null;

	if (!message) {
		return null;
	}

	const contact = await getContact(message.contact);
	if (!contact) {
		return null;
	}

	const media = message.media ? await getMedia(message.media) : undefined;

	return {
		...message,
		taggedContacts: JSON.parse(`[${message.taggedContacts}]`),
		contact: contact,
		quotedMessage: message.quotedMessage
			? (await getMessage(message.quotedMessage)) ?? undefined
			: undefined,

		media,
	};
};
