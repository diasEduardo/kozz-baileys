import { Media } from 'kozz-types';
import { randomUUID } from 'crypto';
import Context from 'src/Context';
import fs from 'fs/promises';
import mime from 'mime-types';
import { delay } from 'src/util/utility';

const database = Context.get('database');
const fileDownloadPath = process.env.MIDIAS_PATH || './medias'

export const saveMedia = async (media: Media): Promise<string> => {
	const mediaId = `${randomUUID()}.${mime.extension(media.mimeType)}`;
	const filePath = `${fileDownloadPath}/${mediaId}`;

	await fs.writeFile(filePath, media.data, {
		encoding: 'base64url',
	});

	await database.upsert('media', {
		id: mediaId,
		timestamp: new Date().getTime(),
		mimeType: media.mimeType,
		originalFileName: media.fileName ?? `NO_NAME.${mime.extension(media.mimeType)}`,
		deleted: false,
	});

	return mediaId;
};

export const getMedia = async (id: string): Promise<Media> => {
	const file = await fs.readFile(`${fileDownloadPath}/${id}`, {
		encoding: 'base64url',
	});

	return {
		data: file,
		fileName: id,
		mimeType: mime.lookup(id.split('.')[1]) || 'octect/stream',
		sizeInBytes: file.length,
		stickerTags: [],
		transportType: 'b64',
		duration: null,
	};
};

export const deleteFromMediaFolder = async () => {
	if(process.env.MUST_DELETE_MIDIA == 'true'){
		const dayOffset = process.env.MIDIA_STORED_DAYS || 7;
		const pugeDate = new Date();
		pugeDate.setDate(pugeDate.getDate() - (dayOffset as any));

		const midiasToDelete = await database.getValues('media', midia => midia.timestamp < pugeDate.getTime() && !midia.deleted);
		console.log(midiasToDelete?.length)
		if(midiasToDelete){
			for (const midia of midiasToDelete){
				try {
					await fs.unlink(`${fileDownloadPath}/${midia.id}`);
					database.upsert('media', {
						id: midia.id,
						deleted: true,
					});
					console.log(`${midia.id} deleted from folder`)
				} catch(e:any) {
					if(e.errno == -4058){
						console.log(`${midia.id} not founded in folder, marking as deleted`);
						
						database.upsert('media', {
							id: midia.id,
							deleted: true,
						});
					}
				}
					
			}
			setInterval(deleteFromMediaFolder,3600000); //1h in ms
		}

		
		


	}
	


}
