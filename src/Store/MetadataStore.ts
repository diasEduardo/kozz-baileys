import Context from 'src/Context/index.js';
import { ChatMetadata } from './models.js';

const database = Context.get('database');

export const getChatOrder = (limit = 0) => {
	try {
		return database.getSorted('chatMetadata', 'lastMessageTimestamp', 'des', limit);
	} catch (e) {
		console.warn(`Error while trying to get chat order from DB, [Error ${e}]`);
		return [];
	}
};

export const updateChatMetadata = (
	values: Partial<ChatMetadata> & {
		id: string;
	}
) => {
	try {
		return database.upsert('chatMetadata', values);
	} catch (e) {
		console.warn(
			`Error while trying to update chatMetadata. Values = ${values}, [Error ${e}]`
		);
	}
};

export const deleteFromChatMetadataDb = async () => {
	const dayOffset = process.env.DATABASE_STORED_DAYS || 7;
	const pugeDate = new Date();
	pugeDate.setDate(pugeDate.getDate() - (dayOffset as any));

	database.deleteValues('chatMetadata', (metadata:any) => metadata.lastMessageTimestamp < pugeDate.getTime());
	
}
