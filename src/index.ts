import { initSession } from './Client';
import baileysFunctions, {
	inlineCommandMapFunctions,
} from './Client/BaileysFunctions';
import createBoundary from 'kozz-boundary-maker';
import { createFolderOnInit } from './util/utility';
import { createResourceGatheres } from './Resource';
import { deleteFromMediaDb, deleteFromMediaFolder } from './Store/MediaStore';
import { CronJob } from 'cron';
import fs from 'fs/promises';
import { deleteFromChatMetadataDb } from './Store/MetadataStore';
import { deleteFromMessageDb } from './Store/MessageStore';
import { deleteFromGroupChatDb } from './Store/ChatStore';

export const boundary = createBoundary({
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

initSession(boundary).then(waSocket => {
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

