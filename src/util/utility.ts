import fs from 'fs';
import { ContactPayload } from 'kozz-types';

export const createFolderOnInit = () => {
	tryCreateFolder(`./medias`);
};

const tryCreateFolder = (path: string) => {
	try {
		fs.mkdirSync(path);
	} catch {}
};

export const clearContact = (Contact: string) => {
	/**
	 *  '554899295890:3@s.whatsapp.net' to
	 *  '554899295890@s.whatsapp.net'
	 */
	return Contact.replace(/\:[0-9]*\@/, '@');
};

export const getMyContactFromCredentials = () => {
	const credFile = fs.readFileSync('./creds/creds.json');
	let jsonCred = JSON.parse(credFile.toString());
	jsonCred.me.id = clearContact(jsonCred.me.id!);
	return jsonCred.me;
};

export const replaceTaggedName = (text: string, tagged: ContactPayload[]) => {
	const contacts = tagged.map(contact => {
		const sanitizedId = '@' + contact.id.replace('@s.whatsapp.net', '');
		const publicName = contact.publicName;

		return {
			sanitizedId,
			publicName,
		};
	});

	return text
		.split(' ')
		.map(word => {
			if (!word.startsWith('@')) {
				return word;
			}

			const contact = contacts.find(contact => contact.sanitizedId === word);
			if (contact) {
				return contact.publicName;
			}

			return word;
		})
		.join(' ');
};

export const generateHash = async (length: number) => {
	var result = '';
	var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	var charactersLength = characters.length;
	for (var i = 0; i < length; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
};

export const getFormattedDateAndTime = (date?: number | Date) => {
	// creating new date with -3 hours to use GMT -3;
	const threeHours = 1000 * 60 * 3;
	const now = date ? new Date(date) : new Date(new Date().getTime() - threeHours);

	return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1)
		.toString()
		.padStart(2, '0')}/${now.getFullYear()} às ${now
		.getHours()
		.toString()
		.padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
};
