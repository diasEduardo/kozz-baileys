import { initSession } from './Client';
import baileysFunctions, {
	inlineCommandMapFunctions,
} from './Client/BaileysFunctions';
import createBoundary from 'kozz-boundary-maker';
import { createFolderOnInit } from './util/utility';
import { createResourceGatheres } from './Resource';
import { deleteFromMediaFolder } from './Store/MediaStore';

export const boundary = createBoundary({
	url: process.env.GATEWAY_URL || 'ws://localhost:4521',
	chatPlatform: 'Baileys',
	name: process.env.BOUNDARY_NAME || 'kozz-baileys',
	inlineCommandMap: inlineCommandMapFunctions(),
});

createFolderOnInit();

initSession(boundary).then((waSocket: any) => {
	const baileys = baileysFunctions(waSocket);

	boundary.handleReplyWithText((payload, companion, body) => {
		baileys.sendText(payload.chatId, body, payload.quoteId, companion.mentions);
	});

	boundary.handleReplyWithSticker(async (payload, companion, caption) => {
		baileys.sendMedia(
			payload.chatId,
			payload.media!,
			{
				caption,
				mentionedList: companion.mentions,
				asSticker: true,
				contact: payload.contact,
				emojis: payload.media?.stickerTags,
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

	boundary.handleSendMessageWithMedia((payload, companion, body) => {
		baileys.sendMedia(
			payload.chatId,
			payload.media!,
			{ caption: body, mentionedList: companion.mentions },
			payload.quoteId
		);
	});

	boundary.handleReactMessage(async payload => {
		baileys.reactMessage(payload.messageId, payload.emote);
	});

	boundary.hanldeDeleteMessage(payload => {
		baileys.deleteMessage(payload.messageId);
	});

	createResourceGatheres(boundary, baileys);
});

if(process.env.MUST_DELETE_MIDIA == 'true'){
	deleteFromMediaFolder();
	setInterval(deleteFromMediaFolder,3600000); //1h in ms
}