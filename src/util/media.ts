import { downloadMediaMessage, WAMessage } from '@whiskeysockets/baileys';
import { Media } from 'kozz-types';
import { WaSocket } from 'src/Client';
import logger from './logger';

const messageMediaTypes = [
	'videoMessage',
	'stickerMessage',
	'imageMessage',
	'audioMessage',
] as const;

export const downloadMediaFromMessage = async (
	messageEv: WAMessage,
	waSocket: WaSocket
): Promise<Media | undefined> => {
	if (!messageEv.message) {
		return undefined;
	}

	if(messageEv.message?.stickerMessage?.isAnimated){
		messageEv.message.stickerMessage.mimetype = 'video/mp4';
	}


	const mediaType = messageMediaTypes.find(
		messageType => !!messageEv.message![messageType]
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
			fileName: messageEv.message[mediaType]?.directPath || null,
			mimeType: messageEv.message[mediaType]!.mimetype!,
			sizeInBytes: Number(messageEv.message[mediaType]!.fileLength!) || null,
			transportType: 'b64',
			stickerTags: undefined,
			emojis:undefined,
		};
	} catch (e) {
		console.warn(e);
		return undefined;
	}
};
