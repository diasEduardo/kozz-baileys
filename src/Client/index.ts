import dotenv from 'dotenv';

dotenv.config({
	path: '.env',
});

import makeWASocket, {
	Browsers,
	DisconnectReason,
	fetchLatestBaileysVersion,
	useMultiFileAuthState,
} from '@whiskeysockets/baileys';

import BaileysBottle from 'baileys-bottle';
import log from '@whiskeysockets/baileys/lib/Utils/logger';
import { Boom } from '@hapi/boom';
import { getGroupChat, saveGroupChat } from 'src/Store/ChatStore';

export type WaSocket = ReturnType<typeof makeWASocket>;

console.clear();
console.log('Initializing DB...');

export const initSession = (sessionName: string) =>
	BaileysBottle.init({
		type: 'sqlite',
		database: 'db.sqlite',
	}).then(async bottle => {
		console.log('DB initialized');
		console.log(`Starting client "${sessionName}"`);

		const logger = log.child({});
		logger.level = 'info';

		console.log('Creating auth...');
		const { state, saveCreds } = await useMultiFileAuthState('./creds');
		console.log('Done');

		const startSocket = async () => {
			const { version, isLatest } = await fetchLatestBaileysVersion();
			console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`);

			const waSocket = makeWASocket({
				version,
				printQRInTerminal: true,
				auth: state,
				logger,
				browser: Browsers.ubuntu('Desktop'),
			});

			waSocket.ev.process(async events => {
				// credentials updated -- save them
				if (events['creds.update']) await saveCreds();

				if (events['connection.update']) {
					const update = events['connection.update'];
					console.log('CONNECTION UPDATED =>', update);
					const { connection, lastDisconnect } = update;
					connection === 'open'
						? console.log('Connected')
						: connection === 'close'
						? (lastDisconnect?.error as Boom)?.output?.statusCode !==
						  DisconnectReason.loggedOut
							? startSocket()
							: (async () => {
									startSocket();
							  })()
						: null;
				}
			});

			waSocket.ev.on('chats.update', async payload => {
				if (payload[0].id?.includes('@g.us')) {
					const groupChatInfo = await getGroupChat(payload[0].id);
					const oneHour = 60 * 60 * 1000;

					if (
						!groupChatInfo ||
						groupChatInfo.lastFetched <= new Date().getTime() + oneHour
					) {
						return;
					}

					waSocket.groupMetadata(payload[0].id).then(resp =>
						saveGroupChat({
							id: resp.id,
							community: resp.linkedParent ?? null,
							description: resp.desc ?? '',
							memberCount: resp.size!,
							name: resp.subject,
							owner:
								resp.owner ??
								resp.participants.find(
									participant => participant.admin === 'superadmin'
								)?.id ??
								'NOT_FOUND',
							participants: resp.participants.map(participant => ({
								admin: !!participant.admin,
								id: participant.id,
							})),
						})
					);
				}
			});

			// waSocket.ev.on('contacts.update', payload => {
			// 	console.log('[CONTACTS UPDATE]', { payload });
			// });

			// waSocket.ev.on('contacts.upsert', payload => {
			// 	console.log('[CONTACTS, UPSERT]', { payload });
			// });

			return waSocket;
		};

		return startSocket();
	});
