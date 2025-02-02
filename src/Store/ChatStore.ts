import { GroupChat } from 'kozz-types';
import Context from 'src/Context';
import { GroupChatModel, PrivateChatModel } from './models';

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

export const savePrivateChat = async ({
	id,
	lastMessageTimestamp,
	unreadCount,
}: PrivateChatModel) => {
	console.log({ id, lastMessageTimestamp, unreadCount });

	await database.upsert('privateChat', {
		id,
		lastMessageTimestamp,
		unreadCount,
	});

	return id;
};

export const getPrivateChat = (id: string) => database.getById('privateChat', id);

export const updateChatUnreadCount = async (id: string, unreadCount: number) => {
	try {
		if (!id || !unreadCount) {
			return;
		}

		if (id.includes('@g.us')) {
			await database.upsert('groupChat', {
				id,
				unreadCount,
			});
		} else {
			await database.upsert('privateChat', {
				id,
				unreadCount,
			});
		}
	} catch (e) {
		return;
	}
};

export const getUnreadCount = async (id: string) => {
	try {
		if (!id) {
			return 0;
		}
		if (id.includes('@g.us')) {
			return database.getById('groupChat', id)?.unreadCount ?? 0;
		} else {
			return database.getById('privateChat', id)?.unreadCount ?? 0;
		}
	} catch (e) {
		return 0;
	}
};
