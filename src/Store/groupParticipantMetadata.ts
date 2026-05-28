import { ContactPayload, Media, SendMessagePayload } from 'kozz-types';
import Context from 'src/Context/index.js';
import { ContactModel, GroupChatModel, groupParticipantMetadata, groupParticipantUpdate } from './models.js';
import moment from 'moment/moment.js';

const database = Context.get('database');

export const updateGroupParticipantMetadata = async (from:string, to:string, fromName:string): Promise<string> => {
	
	/*await database.upsert('contact', {
		...contact,
	});*/
	const today = moment().format('YYYY-MM-DD');
	const id = `${from}_${to}_${today}`;
	let count = 1;
	const existingEntry = await database.getById(
		'groupParticipantMetadata',
		id
	) as groupParticipantMetadata | null;
	
	if (existingEntry) {
		count += existingEntry.messageCount;
	}

	const data = {
			id: id,
			participantId: from,
			participantName: fromName || '',
			groupId: to,
			date: today,
			messageCount: count
		} as groupParticipantMetadata
	
	await database.upsert('groupParticipantMetadata', {
		...data,
	});

	return id;
};

export const insertGroupParticipantUpdate = async (
	payload:{
		participantId:string, 
		groupId:string, 
		authorId:string, 
		action:string
	}): Promise<string> => {
	
	const today = moment().format('YYYY-MM-DD');
	const todayWithHour = moment().format('YYYY-MM-DD HH:mm:ss');
	const id = `${payload.authorId}_${payload.groupId}_${payload.participantId}_${payload.action}_${todayWithHour}`;
	
	const authorContact = await database.getById('contact', payload.authorId) as ContactModel | null;
	const participantContact = await database.getById('contact', payload.participantId) as ContactModel | null;
	const groupData = await database.getById('groupChat', payload.groupId) as GroupChatModel | null;

	const data = {
			id: id,
			authorId: payload.authorId,
			authorName: authorContact?.publicName || '',
			participantId: payload.participantId,
			participantName: participantContact?.publicName || '',
			groupId: payload.groupId,
			groupName: groupData?.name || '',
			date: today,
			action: payload.action
		} as groupParticipantUpdate
	
	await database.upsert('groupParticipantUpdate', {
		...data,
	});

	return id;
};
