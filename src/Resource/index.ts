import initBoundary from 'kozz-boundary-maker';
import baileysFunctions from 'src/Client/BaileysFunctions';
import { getGroupChat } from 'src/Store/ChatStore';

export const createResourceGatheres = (
	boundary: ReturnType<typeof initBoundary>,
	baileys: ReturnType<typeof baileysFunctions>
) => {
	const getProfilePicUrl = async ({ id }: { id: string }) => {
		if (!id) {
			return console.warn('Tried to fetch profile pic but no ID was provided!');
		}

		const picUrl = await baileys.getProfilePic(id);
		return picUrl;
	};

	const getGroupChatInfo = async ({ id }: { id: string }) => {
		if (!id) {
			return console.warn('Tried to fetch group chat info but no ID was provided');
		}
		if (!id.includes('@g.us')) {
			return console.warn(
				'Tried to fetch group chat info but got an invalid ID:',
				id
			);
		}
		const groupData = await getGroupChat(id);
		if (!groupData) {
			return console.warn('Unable to fetch group chat info for ID:', id);
		}

		return groupData;
	};

	const groupAdminList = async ({ id }: { id: string }) => {
		if (!id) {
			return console.warn('Tried to fetch group chat info but no ID was provided');
		}
		if (!id.includes('@g.us')) {
			return console.warn(
				'Tried to fetch group chat info but got an invalid ID:',
				id
			);
		}
		const groupData = await getGroupChat(id);
		if (!groupData) {
			return console.warn('Unable to fetch admin list from group ID:', id);
		}

		return {
			adminList: groupData.participants.filter(member => member.admin),
		};
	};

	boundary.onAskResource('contact_profile_pic', getProfilePicUrl);
	boundary.onAskResource('group_chat_info', getGroupChatInfo);
	boundary.onAskResource('group_admin_list', groupAdminList);
};
