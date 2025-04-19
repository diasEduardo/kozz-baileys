import Context from 'src/Context';
import { ChatMetadata } from './models';

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
