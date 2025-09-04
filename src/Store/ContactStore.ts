import { ContactPayload, Media, SendMessagePayload } from 'kozz-types';
import Context from 'src/Context';
import { ContactModel } from './models';

const database = Context.get('database');

export const saveContact = async (contact: ContactPayload): Promise<string> => {
	const oldContact = await database.getById('contact', contact.id);

	if (oldContact && !contact.publicName) {
		await database.upsert('contact', {
			...oldContact,
			publicName: oldContact.publicName,
		});
	} else {
		await database.upsert('contact', {
			...contact,
		});
	}

	return contact.id;
};

export const getContact = async (id: string): Promise<ContactModel | null> => {
	const contact = (await database.getById('contact', id)) as ContactModel | null;
	if (!contact) {
		return null;
	}

	return contact;
};
