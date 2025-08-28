import { GroupChat } from 'kozz-types';
import Context from 'src/Context';
import { GroupChatModel, PrivateChatModel } from './models';
import { getContact } from './ContactStore';

const database = Context.get('database');


export const saveGroupChat = async (groupChat: GroupChat): Promise<string> => {
	await database.upsert('groupChat', {
		...groupChat,
		lastFetched: new Date().getTime(),
		participants: groupChat.participants.map(
			participant => `${participant.id}#${!!participant.admin}`
		),
	});

	return groupChat.id;
};

export const getGroupChat = async (
	id: string
): Promise<
	| (GroupChat & {
			lastFetched: number;
	  })
	| null
> => {
	const groupChat = (await database.getById(
		'groupChat',
		id
	)) as GroupChatModel | null;
	if (!groupChat) {
		return null;
	}

	return {
		...groupChat,
		participants: groupChat.participants.map(participant => {
			const [id, admin] = participant.split('#');
			return {
				id,
				admin: admin === 'true',
			};
		}),
	};
};

export const savePrivateChat = async ({ id }: PrivateChatModel) => {
	await database.upsert('privateChat', {
		id,
	});

	return id;
};

export const getPrivateChat = (id: string) => database.getById('privateChat', id);

export const updateChatUnreadCount = async (id: string, unreadCount: number) => {
	try {
		await database.upsert('chatMetadata', {
			id,
			unreadCount,
		});
	} catch (e) {
		return;
	}
};

export const getUnreadCount = async (id: string) => {
	try {
		return database.getById('chatMetadata', id)?.unreadCount ?? 0;
	} catch (e) {
		return 0;
	}
};

export const getChatDetails = async (id: string) => {
	try {
		if (!id) {
			return 0;
		}
		if (id.includes('@g.us')) {
			return {
				type: 'group',
				data: database.getById('groupChat', id),
			};
		} else {
			return {
				type: 'private',
				data: database.getById('contact', id),
			};
		}
	} catch (e) {
		return 0;
	}
};

export const deleteFromGroupChatDb = async () => {
	const dayOffset = process.env.DATABASE_STORED_DAYS || 7;
	const pugeDate = new Date();
	pugeDate.setDate(pugeDate.getDate() - (dayOffset as any));

	database.deleteValues('groupChat', group => group.lastFetched < pugeDate.getTime());
	
}