import { initSession } from './Client/index.js';
import baileysFunctions, {
	inlineCommandMapFunctions,
} from './Client/BaileysFunctions.js';
import  createBoundary from 'kozz-boundary-maker';
import { createFolderOnInit } from './util/utility.js';
import { createResourceGatheres } from './Resource/index.js';
import { deleteFromMediaDb, deleteFromMediaFolder } from './Store/MediaStore.js';
import { CronJob } from 'cron';
import fs from 'fs/promises';
import { deleteFromChatMetadataDb } from './Store/MetadataStore.js';
import { deleteFromMessageDb } from './Store/MessageStore.js';
import { deleteFromGroupChatDb } from './Store/ChatStore.js';

export const boundary = createBoundary.default({
	url: process.env.GATEWAY_URL || 'ws://localhost:4521',
	chatPlatform: 'Baileys',
	name: process.env.BOUNDARY_NAME || 'kozz-baileys',
	inlineCommandMap: inlineCommandMapFunctions(),
});

createFolderOnInit();

const deleteOldMedia = () => {
	fs.readdir('./medias').then(files => {
		files.forEach(file => {
			fs.stat(`./medias/${file}`).then(stats => {
				if (Date.now() - stats.birthtimeMs > 86400000) {
					fs.unlink(`./medias/${file}`);
				}
			});
		});
	});
};

initSession(boundary).then((waSocket:any) => {
	const baileys = baileysFunctions(waSocket);

	boundary.handleReplyWithText((payload:any, companion:any, body:any) => {
		baileys.sendText(payload.chatId, body, payload.quoteId, companion.mentions);
	});

	boundary.handleReplyWithSticker(async (payload:any, companion:any, caption:any) => {
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

	boundary.handleReplyWithMedia((payload:any, companion:any, caption:any) => {
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

	boundary.handleSendMessage((payload:any, companion:any, body:any) => {
		baileys.sendText(payload.chatId, body, undefined, companion.mentions);
	});

	boundary.handleSendMessageWithMedia((payload:any, companion:any, body:any) => {
		baileys.sendMedia(
			payload.chatId,
			payload.media!,
			{ caption: body, mentionedList: companion.mentions },
			payload.quoteId
		);
	});

	boundary.handleReactMessage(async (payload:any) => {
		baileys.reactMessage(payload.messageId, payload.emote);
	});

	boundary.hanldeDeleteMessage((payload:any) => {
		baileys.deleteMessage(payload.messageId);
	});

	createResourceGatheres(boundary, baileys);
});

if(process.env.MUST_DELETE_MIDIA == 'true'){
	CronJob.from({
		cronTime: '0 */1 * * * *',
		onTick: deleteFromMediaFolder,
		start: true,
		timeZone: 'America/Sao_Paulo',
	});
	CronJob.from({
		cronTime: '0 */1 * * * *',
		onTick: deleteFromMediaDb,
		start: true,
		timeZone: 'America/Sao_Paulo',
	});
	CronJob.from({
		cronTime: '0 */1 * * * *',
		onTick: deleteFromChatMetadataDb,
		start: true,
		timeZone: 'America/Sao_Paulo',
	});
	CronJob.from({
		cronTime: '0 */1 * * * *',
		onTick: deleteFromMessageDb,
		start: true,
		timeZone: 'America/Sao_Paulo',
	});
	CronJob.from({
		cronTime: '0 */1 * * * *',
		onTick: deleteFromGroupChatDb,
		start: true,
		timeZone: 'America/Sao_Paulo',
	});
}

