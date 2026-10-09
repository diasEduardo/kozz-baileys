import { ContactPayload, Media, SendMessagePayload } from 'kozz-types';
import Context from 'src/Context/index.js';
import { ContactModel, GroupChatModel, groupParticipantMetadata, groupParticipantUpdate } from './models.js';
import moment from 'moment/moment.js';

const database = Context.get('database');
const databaseMetadata = Context.get('databaseMetadata');

export const updateGroupParticipantMetadata = async (from:string, to:string, fromName:string): Promise<string> => {
	

	const today = moment().format('YYYY-MM-DD');
	const id = `${from}_${to}_${today}`;
	let count = 1;
	const existingEntry = await databaseMetadata.getById(
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
	
	await databaseMetadata.upsert('groupParticipantMetadata', {
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
	
	await databaseMetadata.upsert('groupParticipantUpdate', {
		...data,
	});

	return id;
};

export const deleteFromGroupParticipantUpdateDb = async () => {
	const dayOffset = process.env.DATABASE_STORED_DAYS || 7;
	let purgeDate = moment().subtract(dayOffset, 'days');
	let currentDate = purgeDate.format('YYYY-MM-DD')
	let count = 1;

	while (count > 0){
 		count	= databaseMetadata.deleteValues('groupParticipantUpdate', (msg:any) => msg.date == currentDate);
		purgeDate = purgeDate.subtract(1, 'days');
		currentDate = purgeDate.format('YYYY-MM-DD')
	}
	
}

export const deleteFromGroupParticipantMetadataDb = async () => {
	const dayOffset = process.env.DATABASE_ANALYTIC_STORED_DAYS || 30;
	let purgeDate = moment().subtract(dayOffset, 'days');
	let currentDate = purgeDate.format('YYYY-MM-DD')
	let count = 1;

	while (count > 0){
 		count	= databaseMetadata.deleteValues('groupParticipantMetadata', (msg:any) => msg.date == currentDate);
		purgeDate = purgeDate.subtract(1, 'days');
		currentDate = purgeDate.format('YYYY-MM-DD')
	}
	
}
