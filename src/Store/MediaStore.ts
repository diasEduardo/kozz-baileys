import { Media } from 'kozz-types';
import { randomUUID } from 'crypto';
import Context from 'src/Context';
import fs from 'fs/promises';
import mime from 'mime-types';

const database = Context.get('database');

export const saveMedia = async (media: Media): Promise<string> => {
	const mediaId = `${randomUUID()}.${mime.extension(media.mimeType)}`;
	const filePath = `./medias/${mediaId}`;

	await fs.writeFile(filePath, media.data, {
		encoding: 'base64url',
	});

	await database.upsert('media', {
		id: mediaId,
		timestamp: new Date().getTime(),
		mimeType: media.mimeType,
		originalFileName: media.fileName ?? `NO_NAME.${mime.extension(media.mimeType)}`,
	});

	return mediaId;
};

export const getMedia = async (id: string): Promise<Media> => {
	const file = await fs.readFile(`./medias/${id}`, {
		encoding: 'base64url',
	});

	return {
		data: file,
		fileName: id,
		mimeType: mime.lookup(id.split('.')[1]) || 'octect/stream',
		sizeInBytes: file.length,
		stickerTags: [],
		transportType: 'b64',
	};
};
