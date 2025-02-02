import Context from 'src/Context';

const database = Context.get('database');

export const getChatOrder = () => {
	const chatMetadata = database.getById('metadata', 'default');

	return chatMetadata!.chatOrder;
};

export const moveChatToTop = (chatId: string) => {
	const chatMetadata = database.getById('metadata', 'default');
	const newOrder = [
		chatId,
		...chatMetadata!.chatOrder.filter(chat => chat !== chatId),
	];

	database.upsert('metadata', {
		id: 'default',
		chatOrder: newOrder,
	});
};

export const recalculateChatOrder = () => {
	const allChats = [
		...database.getValues('groupChat', () => true)!,
		...database.getValues('privateChat', () => true)!,
	];

	allChats.sort((a, b) => {
		if (a.lastMessageTimestamp > b.lastMessageTimestamp) return -1;
		if (a.lastMessageTimestamp < b.lastMessageTimestamp) return 1;
		return 0;
	});

	const newOrder = allChats.map(chat => chat.id);

	database.upsert('metadata', {
		id: 'default',
		chatOrder: newOrder,
	});

	return newOrder;
};
