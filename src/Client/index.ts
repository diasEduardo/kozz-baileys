import dotenv from 'dotenv';

dotenv.config({
	path: '.env',
});

import makeWASocket, {
	Browsers,
	DisconnectReason,
	fetchLatestBaileysVersion,
	makeCacheableSignalKeyStore,
	useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import NodeCache from 'node-cache';
import log from '@whiskeysockets/baileys/lib/Utils/logger';
import { Boom } from '@hapi/boom';
import {
	getGroupChat,
	saveGroupChat,
	savePrivateChat,
	updateChatUnreadCount,
} from 'src/Store/ChatStore';
import Context, { setMeFromCreds } from 'src/Context';
import { boundary } from '..';
import { saveMessage } from 'src/Store/MessageStore';
import {
	createContactFromSync,
	createGroupChatPayload,
	createMessagePayload,
} from 'src/PayloadTransformers';
import createBoundary from 'kozz-boundary-maker';
import { saveContact } from 'src/Store/ContactStore';

export type WaSocket = ReturnType<typeof makeWASocket>;

console.clear();
console.log('Initializing DB...');

export const initSession = (boundary: ReturnType<typeof createBoundary>) => {
	return startSocket(boundary);
};

const startSocket = async (boundary: ReturnType<typeof createBoundary>) => {
	const logger = log.child({});
	logger.level = 'info';

	console.log('Creating auth...');
	const msgRetryCounterCache = new NodeCache();
	const { state, saveCreds } = await useMultiFileAuthState('./creds');
	console.log('Done');
	const { version, isLatest } = await fetchLatestBaileysVersion();
	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

	const waSocket = makeWASocket({
		version,
		printQRInTerminal: true,
		auth: {
			creds: state.creds,
			/** caching makes the store faster to send/recv messages */
			keys: makeCacheableSignalKeyStore(state.keys, logger),
		},
		msgRetryCounterCache,
		generateHighQualityLinkPreview: true,
		syncFullHistory: true,
		logger,
		browser: Browsers.ubuntu('Desktop'),
	});
	setMeFromCreds();
	sessionEvents(waSocket, saveCreds, boundary);

	return waSocket;
};

let qrString: string | null = null;
let interval: null | NodeJS.Timeout = null;

const sessionEvents = (
	waSocket: ReturnType<typeof makeWASocket>,
	saveCreds: any,
	boundary: ReturnType<typeof createBoundary>
) => {
	waSocket.ev.on('creds.update', () => {
		saveCreds();
	});

	waSocket.ev.on('connection.update', (update: any) => {
		console.log('CONNECTION UPDATED =>', update);

		if (update.qr) {
			qrString = update.qr;
		}

		if (update.qr && !interval) {
			interval = setInterval(
				() => boundary.emitForwardableEvent('qrcode', qrString),
				500
			);
		}

		if (interval && !update.qr) {
			clearInterval(interval);
		}

		const { connection, lastDisconnect } = update;

		if (connection === 'open' || update.isOnline) {
			setTimeout(() => boundary.emitForwardableEvent('chatready', undefined), 5000);
			console.log('Connected');
		}

		const loggedOut =
			(lastDisconnect?.error as Boom)?.output?.statusCode ===
			DisconnectReason.loggedOut;

		if (connection === 'close' && !loggedOut) {
			startSocket(boundary);
		}
	});

	waSocket.ev.on('messaging-history.set', (payload: any) => {
		payload.messages.forEach(async (msg: any) => {
			const payload = await createMessagePayload(msg, waSocket);
			await saveMessage(payload, msg);
		});

		payload.contacts.forEach(async (contact: any) => {
			const payload = await createContactFromSync(contact);
			await saveContact(payload);

			if (payload.isGroup) {
				const groupData = await waSocket.groupMetadata(payload.id);
				await saveGroupChat(createGroupChatPayload(groupData));
			}
		});

		payload.chats.forEach(async (chat: any) => {
			updateChatUnreadCount(chat.id, chat.unreadCount);
		});

		console.log(Object.keys(payload));
	});

	waSocket.ev.on('messages.upsert', async (upsert: any) => {
		for (const msg of upsert.messages) {
			//console.log(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessage)
			//console.log(msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.viewOnceMessageV2?.message)
			console.log(`processando mensagem ${msg.key.id}`);
			if (msg.message?.stickerMessage) {
				msg.message.stickerMessage.url = `https://mmg.whatsapp.net${msg.message.stickerMessage.directPath}`;
			}

			try {
				const payload = await createMessagePayload(msg, waSocket);
				if (Context.get('blockedList').includes(payload.from)) {
					return;
				}

				await saveMessage(payload, msg);
				boundary.emitMessage(payload);
			} catch (e) {
				console.warn(e);
			}
		}
	});

	waSocket.ev.on('chats.update', async (payload: any) => {
		console.log('CHAT UPDATED!!! => \n', JSON.stringify(payload, undefined, '  '));

		if (payload[0].id?.includes('@g.us')) {
			waSocket
				.groupMetadata(payload[0].id)
				.then((ogChatPayload: any) =>
					saveGroupChat(createGroupChatPayload(ogChatPayload))
				);
		} else {
			savePrivateChat(payload);
		}
	});
};
