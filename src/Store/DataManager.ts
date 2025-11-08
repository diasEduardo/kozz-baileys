import Realm from 'realm';
import {
	contactSchema,
	EntityMap,
	groupChatSchema,
	mediaSchema,
	messageSchema,
	privateChatSchema,
	chatMetadataModel,
} from './models.js';

export const initDatabase = () => {
	const config = {
		schema: [
			contactSchema,
			mediaSchema,
			messageSchema,
			groupChatSchema,
			chatMetadataModel,
			privateChatSchema,
		],
		schemaVersion: 5,
	};

	const instance = new Realm(config);

	/**
	 * Upserts the entity and returns the new Object.
	 * @param entityType
	 * @param data
	 * @returns
	 */
	const upsert = <Type extends keyof EntityMap>(
		entityType: Type,
		data: Partial<EntityMap[Type]> & { id: string }
	) => {
		try {
			let obj = {} as EntityMap[Type];
			instance.write(() => {
				obj = instance
					.create(String(entityType), { ...data }, Realm.UpdateMode.All)
					.toJSON() as EntityMap[Type];
			});

			return obj;
		} catch (e) {
			console.warn(
				`Error while upserting ${JSON.stringify(
					data,
					undefined,
					'  '
				)} with data ${data}. No database transaction was done. Error = ${e}`
			);
			return undefined;
		}
	};

	const getValues = <Type extends keyof EntityMap>(
		entityType: Type,
		filterFn: (data: EntityMap[Type]) => boolean
	) => {
		try {
			return instance
				.objects(String(entityType))
				.map(obj => obj.toJSON() as EntityMap[Type])
				.filter(filterFn);
		} catch (e) {
			console.warn(
				`Error while fetching ${String(entityType)}. No database transaction was done. Error = ${e}`
			);
			return undefined;
		}
	};

	const getById = <Type extends keyof EntityMap>(entityType: Type, id: string) => {
		try {
			return instance
				.objectForPrimaryKey(String(entityType), id)
				?.toJSON() as EntityMap[Type];
		} catch (e) {
			console.warn(
				`Error while fetcing ${String(entityType)} with primaryKey ${id}. No database transaction was done. Error = ${e}`
			);
			return undefined;
		}
	};

	const getSorted = <Type extends keyof EntityMap>(
		entityType: Type,
		sortField: keyof EntityMap[Type],
		sortDirection: 'asc' | 'des' = 'asc',
		limit = 0
	) => {
		try {
			const objs = instance
				.objects(String(entityType))
				.sorted(sortField.toString(), sortDirection === 'asc')
				.toJSON() as EntityMap[Type][];

			return limit === 0 ? objs : objs.slice(0, limit);
		} catch (e) {
			console.warn(
				`Error while fetcing ${String(entityType)}, sorting ${sortField.toString()} in ${sortDirection}. No database transaction was done. Error = ${e}`
			);
		}
	};

	const deleteValues = <Type extends keyof EntityMap>(
		entityType: Type,
		filterFn: (data: EntityMap[Type]) => boolean
	) => {
		try {
			let count = 0;
			instance.write(() => {
				instance
					.objects(String(entityType))
					.filter(obj => filterFn(obj.toJSON() as EntityMap[Type]))
					.forEach(obj => {
						instance.delete(obj);
						count++;
					});
			});

			return count;
		} catch (e) {
			console.warn(
				`Error while deleting ${String(entityType)}. No database transaction was done. Error = ${e}`
			);
			return 0;
		}
	};

	return {
		upsert,
		getValues,
		deleteValues,
		getById,
		getSorted,
	};
};
