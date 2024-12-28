import { initSession } from './Client';
import baileysFunctions from './Client/BaileysFunctions';
import Context from './Context';
import { convertMP4ToWebp } from './MediaConverter';
import { createMessagePayload } from './PayloadTransformers';
import { getMessage, saveMessage } from './Store/MessageStore';
import createBoundary from 'kozz-boundary-maker';
import { createFolderOnInit } from './util/utility';

const boundary = createBoundary({
	url: `${process.env.GATEWAY_URL}`,
	chatPlatform: 'Baileys',
	name: 'baileysEduTramonta',
});

createFolderOnInit();

initSession('tramont').then((waSocket:any) => {
	const baileys = baileysFunctions(waSocket);

	waSocket.ev.on('messages.upsert', async (upsert:any) => {
		
		for (const msg of upsert.messages) {
			try {
				const payload = await createMessagePayload(msg, waSocket);
				if (Context.get('blockedList').includes(payload.from)) {
					return;
				}

				await saveMessage(payload, msg);
				// console.log(
				// 	JSON.stringify(
				// 		{
				// 			body: payload.body,
				// 			author: payload.contact.id,
				// 			msg,
				// 		},
				// 		undefined,
				// 		'  '
				// 	)
				// );
				boundary.emitMessage(payload);
			} catch (e) {
				console.warn(e);
			}
		}
	});

	boundary.handleReplyWithText(async (payload, companion, body) => {
		console.log((await baileys.sendText(payload.chatId, body, payload.quoteId, companion.mentions))?.message);
	});

	boundary.handleReplyWithSticker(async (payload, companion, caption) => {
		baileys.sendMedia(
			payload.chatId,
			payload.media!,
			{
				caption,
				mentionedList: companion.mentions,
				asSticker: true,
			},
			payload.quoteId
		);
	});

	boundary.handleReplyWithMedia((payload, companion, caption) => {
		baileys.sendMedia(
			payload.chatId,
			payload.media!,
			{
				caption,
				mentionedList: companion.mentions,
			},
			payload.quoteId
		);
	});

	boundary.handleSendMessage((payload, companion, body) => {
		baileys.sendText(payload.chatId, body, undefined, companion.mentions);
	});

	boundary.handleReactMessage(async payload => {
		baileys.reactMessage(payload.messageId, payload.emote);
	});

	boundary.onAskResource('contact_profile_pic', async ({ id }) => {
		console.log('getting profile pic url from', id);
		const pic = await baileys.getProfilePic(id);
		console.log({ pic });
		return pic;
	});

	boundary.hanldeDeleteMessage(payload => {
		baileys.deleteMessage(payload.messageId);
	});
});
