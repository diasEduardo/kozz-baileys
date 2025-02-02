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
	lastUnreadTimestamp,
	unreadCount,
}: PrivateChatModel) => {
	console.log({ id, lastUnreadTimestamp, unreadCount });

	await database.upsert('privateChat', {
		id,
		lastUnreadTimestamp,
		unreadCount,
	});

	return id;
};

export const getPrivateChat = (id: string) => database.getById('privateChat', id);

export const updateChatUnreadCount = async (id: string, unreadCount: number) => {
	if (!id || !unreadCount) {
		return;
	}

	if (id.includes('@g.us')) {
		await database.upsert('groupChat', {
			id,
			unreadCount,
			name: '__no_name__',
		});
	} else {
		await database.upsert('privateChat', {
			id,
			unreadCount,
		});
	}
};
