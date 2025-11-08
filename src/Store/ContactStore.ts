import { ContactPayload, Media, SendMessagePayload } from 'kozz-types';
import Context from 'src/Context/index.js';
import { ContactModel } from './models.js';

const database = Context.get('database');

export const saveContact = async (contact: ContactPayload): Promise<string> => {
	await database.upsert('contact', {
		...contact,
	});

	return contact.id;
};

export const getContact = async (id: string): Promise<ContactModel | null> => {
	const contact = (await database.getById('contact', id)) as ContactModel | null;
	if (!contact) {
		return null;
	}

	return contact;
};
