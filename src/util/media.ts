import { downloadMediaMessage, WAMessage } from 'baileys';
import { Media } from 'kozz-types';
import { WaSocket } from 'src/Client';
import logger from './logger';

const messageMediaTypes = [
	'videoMessage',
	'stickerMessage',
	'imageMessage',
	'audioMessage',
] as const;

const getMessageContent = (message: WAMessage) => {
	return (
		message.message?.ephemeralMessage?.message ||
		message.message?.viewOnceMessageV2?.message ||
		message.message?.viewOnceMessageV2Extension?.message ||
		message.message
	);
};

export const downloadMediaFromMessage = async (
	messageEv: WAMessage,
	waSocket: WaSocket
): Promise<Media | undefined> => {
	const messageContent = getMessageContent(messageEv);
	if (!messageContent) {
		return undefined;
	}

	const stickerMessage = messageContent.stickerMessage;

	if (stickerMessage?.isAnimated) {
		stickerMessage.mimetype = 'video/mp4';
	}

	const mediaType = messageMediaTypes.find(
		messageType => !!messageContent[messageType]
	);

	if (!mediaType) {
		return undefined;
	}

	try {
		const mediaBuffer = await downloadMediaMessage(
			messageEv,
			'buffer',
			{},
			{
				logger,
				reuploadRequest: waSocket.updateMediaMessage,
			}
		);

		return {
			data: mediaBuffer.toString('base64'),
			fileName: messageContent[mediaType]?.directPath || null,
			mimeType: messageContent[mediaType]!.mimetype!,
			sizeInBytes: Number(messageContent[mediaType]!.fileLength!) || null,
			transportType: 'b64',
			stickerTags: undefined,
			duration: null,
		};
	} catch (e) {
		console.warn(e);
		return undefined;
	}
};
